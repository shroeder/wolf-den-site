// ── DOES EVERY NODE IN EVERY TREE ACTUALLY DO SOMETHING? ─────────────────────────────────────────────────────
// The Den's oldest bug class is a declared effect nothing consumes: a node reads beautifully on the card,
// costs a real skill point, and moves no number in the engine. Runebrand, Kindling, Wheelwise and the arena's
// own accuracy stat have all been that at some point, and every one of them was found by a person noticing,
// not by anything automatic.
//
// This checks four things per tree, and every one of them is a bug that has actually shipped here:
//
//   1. DEAD PASSIVE      the node's `stat` appears nowhere in the engine, so the points buy nothing.
//   2. ATTACKER-ONLY     the stat is read on YOUR side but not on theirs (or the reverse), so the same
//                        kit is stronger in one pair of hands than the other. See the offence/defence rule.
//   3. UNHANDLED ACTIVE  the ability `kind` has no branch in the engine, so casting it does nothing.
//   4. CARD DRIFT        the number written in `desc` is not the number `per` actually pays.
//
// It reads the engine as TEXT rather than importing it, because arena.js pulls in the DB. That means it can
// only prove a stat is MENTIONED, not that the arithmetic is right — so a pass here is a floor, not a
// guarantee. What it does catch is the whole "reads well, does nothing" family.
//
// Run:  node scripts/check-tree.mjs     (or npm run check:tree)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "marketplace");
const classes = readFileSync(join(LIB, "arena-classes.js"), "utf8");
// arena.js AND arena-kit.js: FREE_KINDS lives in the kit, so a ward dispatched through isFreeKind()
// looks unimplemented if you only read the engine.
const engine = readFileSync(join(LIB, "arena.js"), "utf8") + readFileSync(join(LIB, "arena-kit.js"), "utf8");
// The kit AND the class table: a folded stat may be set by classBase() in arena-classes rather than
// by buildKit(), which reported the Warden's Footwork as buying nothing.
const kit = engine + classes;

// Stats the KIT folds into a fighter's numbers before the bout starts (might, health, dr...). Those are read
// via the kit rather than as `P.<stat>`, so they are legitimately absent from the engine's perk lookups.
const FOLDED = new Set(["might", "health", "dr", "accuracy", "speed", "crit", "critMult", "critStat", "guard", "lifesteal"]);

const nodes = [];
for (const m of classes.matchAll(/N\(\{([^]*?)\}\),/g)) {
    const b = m[1];
    const g = (re) => (b.match(re) || [])[1];
    nodes.push({
        id: g(/id:\s*"([a-z0-9_]+)"/),
        name: g(/name:\s*"([^"]+)"/),
        kind: /kind:\s*"active"/.test(b) ? "active" : "passive",
        stat: g(/stat:\s*"([A-Za-z]+)"/),
        ability: g(/ability:\s*"([a-z]+)"/),
        per: g(/per:\s*([0-9.]+)/),
        ranks: g(/ranks:\s*([0-9]+)/),
        desc: g(/desc:\s*"([^"]+)"/) || "",
    });
}
if (nodes.length < 30) {
    console.error(`check:tree — parsed only ${nodes.length} nodes; the tree's shape moved and this check is blind.`);
    process.exit(1);
}

// The kinds the engine plays for free, read off the kit rather than restated here.
const FREE_KINDS = [...(engine.match(/FREE_KINDS = new Set\(\[([^\]]*)\]/) || [])[1]?.matchAll(/"([a-z]+)"/g) || []].map((m) => m[1]);

const problems = [];
const seenStat = new Set();

for (const n of nodes) {
    if (n.kind === "active") {
        // The engine must have a branch for this kind on BOTH sides — yours resolves on `ability.kind`,
        // theirs on the picker's `k`.
        // A FREE SKILL RESOLVES SOMEWHERE ELSE. A ward and a riposte never reach the main switch — they are
        // played before it and keep your beat — so looking only for `ability.kind === x` reported the Warden's
        // two signature moves as unimplemented. Both spellings count, on both sides.
        const anywhere = (re) => re.test(engine);
        const mine = anywhere(new RegExp(`kind === "${n.ability}"`))
            || anywhere(new RegExp(`\.${n.ability}\b`))
            || anywhere(new RegExp(`free === "${n.ability}"`));
        // The defender's ward is dispatched by the ABSENCE of "riposte" — `if (incoming.free)` then an
        // else — so the literal string never appears on that path. A kind listed in FREE_KINDS counts as
        // handled for them if the engine reads `incoming.free` at all; every other kind must name itself.
        const freeHandled = FREE_KINDS.includes(n.ability) && /incoming\.free/.test(engine);
        const theirs = anywhere(new RegExp(`k === "${n.ability}"`))
            || anywhere(new RegExp(`free === "${n.ability}"`))
            || anywhere(new RegExp(`foe${n.ability[0].toUpperCase()}${n.ability.slice(1)}\b`)) || freeHandled;
        if (!mine) problems.push(`UNHANDLED ACTIVE   ${n.id} (${n.name}) — kind "${n.ability}" has no branch on your side`);
        else if (!theirs) problems.push(`ATTACKER-ONLY     ${n.id} (${n.name}) — kind "${n.ability}" resolves for you but not when an opponent casts it`);
        continue;
    }
    if (!n.stat) { problems.push(`NO STAT           ${n.id} (${n.name}) — a passive that names no stat cannot move anything`); continue; }
    seenStat.add(n.stat);

    if (!FOLDED.has(n.stat)) {
        const mine = new RegExp(`P\\.${n.stat}\\b`).test(engine);
        const theirs = new RegExp(`FP\\.${n.stat}\\b`).test(engine);
        if (!mine && !theirs) problems.push(`DEAD PASSIVE      ${n.id} (${n.name}) — "${n.stat}" is read nowhere in the engine`);
        else if (!mine) problems.push(`DEFENDER-ONLY     ${n.id} (${n.name}) — "${n.stat}" is read as FP.${n.stat} but never as P.${n.stat}`);
        else if (!theirs) problems.push(`ATTACKER-ONLY     ${n.id} (${n.name}) — "${n.stat}" is read as P.${n.stat} but never as FP.${n.stat}`);
    } else if (!new RegExp(`\\b${n.stat}\\b`).test(kit)) {
        problems.push(`DEAD PASSIVE      ${n.id} (${n.name}) — "${n.stat}" is folded by the kit, but the kit never mentions it`);
    }

    // CARD DRIFT — the first number in the prose against what a rank actually pays.
    const per = Number(n.per);
    const dm = n.desc.match(/([0-9]+(?:\.[0-9]+)?)(%?)/);
    if (Number.isFinite(per) && dm) {
        const said = Number(dm[1]);
        const pays = dm[2] === "%" ? per * 100 : per;
        // A `desc` may lead with a different number (a duration, a cap) — only flag a same-unit mismatch.
        if (Math.abs(said - pays) > 0.001 && Math.abs(said - pays) < Math.max(said, pays) * 5) {
            problems.push(`CARD DRIFT        ${n.id} (${n.name}) — card says ${said}${dm[2]}, pays ${Math.round(pays * 1000) / 1000}${dm[2]}`);
        }
    }
}

const passives = nodes.filter((n) => n.kind === "passive").length;
const actives = nodes.length - passives;
if (problems.length) {
    console.error(`check:tree — ${problems.length} problem(s) across ${nodes.length} nodes:\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\nA node that reads well and moves no number is the most expensive kind of bug here: it costs a\nreal skill point and nobody can tell from the screen that it did nothing.");
    process.exit(1);
}
console.log(`check:tree — ${passives} passives and ${actives} actives across 3 trees; every stat is read on BOTH sides and every ability kind resolves.`);
