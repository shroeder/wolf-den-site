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
// arena-engine.js too: the beat's pure arithmetic lives there now so the balance simulator can run the real
// code, and this check reads the engine as TEXT — so a file it does not open is a mechanic it cannot see.
// Moving the burn and wound helpers out reported five live nodes as dead until this line was updated.
// arena-ring.js and arena-atb.js as well, and for the third time the same lesson: a file this does not open
// is a mechanic it cannot see. Turn order, the timer bar and every status effect that touches it moved into
// those two, so `extra` (the bar refund, read in closeTurn) and `chill` (applied to the bar in barEffects)
// both reported as dead nodes while being the most recently rewritten mechanics in the game.
const engine = readFileSync(join(LIB, "arena.js"), "utf8")
    + readFileSync(join(LIB, "arena-kit.js"), "utf8")
    + readFileSync(join(LIB, "arena-engine.js"), "utf8")
    + readFileSync(join(LIB, "arena-ring.js"), "utf8")
    + readFileSync(join(LIB, "arena-atb.js"), "utf8");
// The AI picker rebuilds the one move an opponent is throwing — a THIRD allowlist these flags must survive.
const picker = readFileSync(join(LIB, "arena-ai.js"), "utf8");
// The kit AND the class table: a folded stat may be set by classBase() in arena-classes rather than
// by buildKit(), which reported the Warden's Footwork as buying nothing.
const kit = engine + classes;

// Stats the KIT folds into a fighter's numbers before the bout starts (might, health, dr...). Those are read
// via the kit rather than as `P.<stat>`, so they are legitimately absent from the engine's perk lookups.
const FOLDED = new Set(["might", "health", "dr", "accuracy", "speed", "crit", "critMult", "critStat", "guard", "lifesteal",
    // Brutality is a flat damage multiplier folded into the kit exactly as lifesteal is, then read off the
    // fighter (b.me.dmgPct) rather than the perk bag — so the P.<stat> lookup below would never find it.
    "dmgPct"]);

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

// ── A STAT READ THROUGH A SHARED HELPER IS STILL READ ────────────────────────────────────────────────────────
// The engine used to spell out `P.rendTick` on your side and `FP.rendTick` on theirs, in two copies of the same
// four lines, and this check simply looked for both spellings. Those copies are now ONE function taking a perk
// bag — which is strictly better (the two sides cannot drift), and which made five live nodes report as dead
// the moment it landed. A guard that goes red on the fix is worse than no guard, because the next person
// silences it.
//
// So: find helpers shaped `function name(b, onFoe, perks)`, and count a `perks.<stat>` inside one as read on
// whichever side that helper is actually CALLED for. Both call shapes must exist, or it is still one-sided.
const HELPERS = [...engine.matchAll(/function (\w+)\(b, onFoe, perks[^)]*\)\s*\{([^]*?)\n\}/g)]
    .map(([, name, body]) => ({ name, body }));

function sharedReads(stat) {
    let mine = false;
    let theirs = false;
    for (const h of HELPERS) {
        if (!new RegExp(`perks\\.${stat}\\b`).test(h.body)) continue;
        // Called with your perk bag for your side, and theirs for theirs. `true`/`false` is the `onFoe` flag:
        // your blows land on the foe, so yours is the `true` call.
        if (new RegExp(`${h.name}\\(b, true, P\\b`).test(engine)) mine = true;
        if (new RegExp(`${h.name}\\(b, false, FP\\b`).test(engine)) theirs = true;
        // A counter (or anything else) that passes the side through a variable serves both, provided the
        // caller itself is reached from both sides — `counterBlow(b, mine)` picks the bag by side above it.
        if (new RegExp(`${h.name}\\(b, mine, perks\\b`).test(engine)) { mine = true; theirs = true; }
    }
    return { mine, theirs };
}

// ── ⚠️ THE ENGINE STOPPED HAVING A PERK BAG, AND THIS CHECK DID NOT NOTICE ───────────────────────────────────
// This used to look for `P.<stat>` and `FP.<stat>` — your perks and theirs, spelled out separately on the two
// sides of every line. That model is gone: `sideOf` now folds every perk ONTO the fighter and the engine reads
// `att.<stat>` / `def.<stat>`, which is strictly better because the two sides physically cannot drift — the
// same code runs for whoever is swinging.
//
// There are ZERO `P.` and ZERO `FP.` left in arena-engine.js. So this test reported 33 of 36 nodes dead, which
// is not a finding, it is a broken guard — and the file's own comment eight lines up says what that costs:
// "a guard that goes red on the fix is worse than no guard, because the next person silences it." It happened
// again, to the same check, for the same reason.
//
// The sidedness tests went with it, deliberately. ATTACKER-ONLY and DEFENDER-ONLY existed to catch the two
// spellings drifting apart; with one symmetric function there is nothing to drift, and a check that cannot
// fail is noise.
//
// A stat is ALIVE if either is true:
//   1. the engine reads it off a fighter — `att.x`, `def.x`, `attacker.x`, `defender.x`. NOT `f.x`, which is
//      the builder reading its own input and would count every stat as read the moment it was declared.
//   2. the builder FOLDS it into another stat that is itself alive — stunBonus is never read anywhere, it is
//      added into `stun` inside sideOf, and `stun` is what the engine swings on. Resolved rather than
//      assumed: find the builder line that consumes it and check the key that line assigns.
// Naming the identifiers a fighter can be called was the first attempt and it was wrong within a minute:
// the engine reads `lighter.burnLeech` when a burn drinks, and the ring reads `f.extra` off whichever side is
// swinging. An allowlist of variable names is a list somebody has to remember to extend — the exact shape of
// bug this whole file exists to catch. So the test is structural instead.
//
// EVERY LINE that assigns something, anywhere in the sources above, with the key it assigns to.
const LINES = engine.split(String.fromCharCode(10));
const ASSIGNS = LINES.map((l) => (l.match(/^\s{2,}([a-zA-Z][a-zA-Z0-9]*):\s*(.+)$/) || []).slice(1))
    .map(([key, expr]) => (key ? { key, expr } : null));
// The COMBAT_FIELDS allowlist is a list of NAMES, not a use of any of them. Counting it as a read would make
// every stat alive the moment it was declared, which is precisely the bug.
const fieldsStart = LINES.findIndex((l) => l.includes("COMBAT_FIELDS = ["));
const fieldsEnd = fieldsStart < 0 ? -1 : LINES.findIndex((l, i) => i > fieldsStart && l.trim() === "];");

// RULE A — somebody reads `.stat` on a line that is not simply DECLARING that stat. A declaration copies the
// value onto the fighter and proves nothing; a read is a line that does something with it.
function directRead(stat) {
    const re = new RegExp(`\\.${stat}\\b`);
    for (let i = 0; i < LINES.length; i += 1) {
        if (fieldsStart >= 0 && i >= fieldsStart && i <= fieldsEnd) continue;
        if (!re.test(LINES[i])) continue;
        if (ASSIGNS[i]?.key === stat) continue;     // `stat: ... Number(f.stat) ...` — the fold itself
        return true;
    }
    return false;
}
// RULE B — it is FOLDED into another stat, and that one is alive. stunBonus is never read anywhere; it is
// added into `stun` inside the builder, and `stun` is what the engine swings on. armorPct is the same shape
// one file over, multiplied into `armor` by the kit. Resolved rather than assumed: follow the key.
function aliveStat(stat, seen = new Set()) {
    if (seen.has(stat)) return false;          // a fold that points at itself is not a read
    seen.add(stat);
    if (directRead(stat)) return true;
    const re = new RegExp(`\\.${stat}\\b`);
    for (let i = 0; i < LINES.length; i += 1) {
        const a = ASSIGNS[i];
        if (!a || a.key === stat || !re.test(a.expr)) continue;
        if (aliveStat(a.key, seen)) return true;
    }
    return false;
}

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
        if (!aliveStat(n.stat)) {
            problems.push(`DEAD PASSIVE      ${n.id} (${n.name}) — "${n.stat}" is read nowhere in the engine`);
        }
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

// ── 5. DOES THE FLAG SURVIVE THE ALLOWLIST? ──────────────────────────────────────────────────────────────
// treeAbilities() rebuilds each active as a NEW object naming the fields it keeps. A flag the tree sets and
// that list forgets is dropped before the engine ever sees it — silently, with the card still promising it.
// That is exactly how Channel stopped setting anything alight, Rimeshatter stopped being able to freeze, and
// Emberbrand — a rend that must BURN — fell through to the default and bled instead. Same shape as the foe
// allowlist that lost The Long Road its rung.
const FLAGS = ["burns", "bleeds", "freezes"];
const allowStart = classes.indexOf("export function treeAbilities");
// COMMENTS STRIPPED FIRST. The note explaining this very check names all three flags, so a plain substring
// search found them in the prose and reported a pass with the code removed — a checker that cannot fail.
const allow = (allowStart < 0 ? "" : classes.slice(allowStart, allowStart + 2500))
    .split(String.fromCharCode(10)).filter((x) => !x.trim().startsWith("//")).join(" ");
for (const f of FLAGS) {
    // NOT a template literal with  in it: inside backticks that is a BACKSPACE character, not a
    // word boundary, so the test never matched and this whole check could never fire.
    const usedByTree = classes.includes(f + ": true");
    const usedByEngine = engine.includes("ability." + f);
    // Both rebuilds: treeAbilities() for the ability, and the picker's swing() for the move being thrown.
    // Looks for the ASSIGNMENT, not the word: a fixed-size window around swing() got eaten by the comment
    // explaining why the assignment is there, and a bare word search finds it in that comment either way.
    const pickerCopies = picker.includes(`${f}: Boolean(ability`);
    if (usedByTree && usedByEngine && !pickerCopies) {
        problems.push(`FLAG DROPPED      the AI picker's swing() never copies "${f}" — an OPPONENT throwing that move loses it, so PvP behaves differently from PvE`);
    }
    if (usedByTree && usedByEngine && !allow.includes(f)) {
        problems.push(`FLAG DROPPED      treeAbilities() never copies "${f}" — the tree sets it and the engine reads it, so it is thrown away in between`);
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
