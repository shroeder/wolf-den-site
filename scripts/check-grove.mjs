// ── IS MAP ONE INTERNALLY HONEST? ────────────────────────────────────────────────────────────────────────────
// The Grove is a content map with a lot of cross-references — twelve zones naming enemies, enemies naming
// parts and emblems, recipes naming parts — and every one of those is a string that can be wrong without
// anything throwing. A misspelled part id does not crash; it just silently drops nothing, for ever.
//
// So this holds the content to the rules the design actually promised:
//
//   · every part a player can get is used by AT LEAST ONE recipe (Luke's rule, verbatim)
//   · every enemy a zone names exists
//   · every part an enemy drops exists
//   · every emblem an enemy carries exists
//   · every part a recipe asks for exists
//   · no ordinary enemy pays gold — only the rare spawn
//   · the difficulty actually climbs
//   · the emblem ladder fails UPWARD
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-grove.mjs
import fs from "node:fs";

import {
    mapIsBuilt, MAPS_BUILT, GROVE_MAPS, toolRecipesForMap, ROLES,
    MAP_ENEMIES, MAP_BOSSES, MAP_PARTS, MAP_ZONES,
} from "@/lib/marketplace/grove-maps.js";
import {
    GROVE_PARTS, GROVE_ENEMIES, GROVE_ZONES, GROVE_EMBLEMS, GROVE_RARE, emblemStars, scaledFoe, GROVE_POP, EMBLEM_STARS, GROVE_BOSSES, GROVE_HYPER, BOSS_COOLDOWN_MS, bossHyperChance, GROVE_FOODS, groveArt, GROVE_BIOMES, groveBiome, slabArt, hangArt, sitArt, SLAB_SURFACE, toolArt,
} from "@/lib/marketplace/grove-catalog.js";
import { GROVE_RECIPES, discoveredRecipes, TOOL_SLOTS, TOOL_TIER_CAP } from "@/lib/marketplace/grove-recipes.js";
import { MAP_LAYOUT, mapSpot, nodeArt, spotForDepth } from "@/lib/marketplace/grove-map.js";
import { pickHyper, rollBoss } from "@/lib/marketplace/grove-roll.js";
import { makeTelegraph } from "@/lib/marketplace/grove-world.js";
import { CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { DECORATIONS } from "@/lib/marketplace/decorations.js";
import { CLASSES, treeFor } from "@/lib/marketplace/arena-classes.js";
import { fighterFrom } from "@/lib/marketplace/arena.js";
import {
    HERO_UNITS, PET_UNITS, SKY_TILE_COUNT,
    viewFor, petFollow, cameraX, cameraY, screenX, fetchRangeFor, bossNoticeFor, petLostFor,
} from "@/lib/marketplace/grove-view.js";

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// ── 1. REFERENCES ────────────────────────────────────────────────────────────────────────────────────
for (const z of GROVE_ZONES) {
    for (const e of z.enemies) ok(GROVE_ENEMIES[e], `zone ${z.id}: unknown enemy "${e}"`);
    ok(GROVE_BOSSES[z.boss], `zone ${z.id}: unknown boss "${z.boss}"`);
    // ⚠️ A BOSS MUST NOT BE ONE OF THE ZONE'S OWN WANDERERS. Every zone used to name one of its own
    // enemies here, so "the boss" was a creature you had already killed two hundred times with more health
    // on it. This is the assertion that stops that coming back.
    ok(!z.enemies.includes(z.boss), `zone ${z.id}: boss "${z.boss}" is also one of its wandering enemies`);
    ok(z.toUnlock > 0, `zone ${z.id}: toUnlock must be a kill count`);
}
for (const [id, e] of Object.entries(GROVE_ENEMIES)) {
    ok(GROVE_EMBLEMS[e.emblem], `enemy ${id}: unknown emblem "${e.emblem}"`);
    for (const row of e.loot) ok(GROVE_PARTS[row.part], `enemy ${id}: unknown part "${row.part}"`);
    // ⚠️ THE RULE THAT MATTERS MOST. A kill loop that pays gold is the one faucet shape in this game with
    // no natural daily cap.
    ok(e.gold === undefined, `enemy ${id}: ordinary enemies must not pay gold`);
}
for (const row of GROVE_RARE.loot) ok(GROVE_PARTS[row.part], `rare spawn: unknown part "${row.part}"`);
ok(GROVE_EMBLEMS[GROVE_RARE.emblem], "rare spawn: unknown emblem");
for (const r of GROVE_RECIPES) {
    for (const p of Object.keys(r.parts)) ok(GROVE_PARTS[p], `recipe ${r.id}: unknown part "${p}"`);
}

// ── 1b. EVERY SYSTEM IS FED, AND EVERY LADDER IS WHOLE ───────────────────────────────────────────────
// Luke: "the easy gaps we should fix, which include feeding all systems" and "extend them to their highest
// tiers, which I would say would be represented by a tier per map."
//
// Two failures this exists to catch, both of which look fine in a diff:
//   A TOOL WITH NO RECIPE   a slot on the screen that can never be filled. The slot renders, the bonus
//                           reads as a promise, and nothing in the game can produce it.
//   A LADDER WITH A HOLE    map four shipping eleven of the twelve tools. The twelfth slot silently stops
//                           at tier III for ever, and the only way anyone finds out is by grinding to it.
const ladders = new Map(TOOL_SLOTS.map((t) => [t.slot, []]));
for (const r of GROVE_RECIPES.filter((x) => x.kind === "tool")) {
    ok(ladders.has(r.slot), `tool recipe ${r.id}: slot "${r.slot}" is not a TOOL_SLOT`);
    ok(Number.isInteger(r.tier) && r.tier >= 1 && r.tier <= TOOL_TIER_CAP,
        `tool recipe ${r.id}: tier ${r.tier} is outside 1..${TOOL_TIER_CAP}`);
    if (ladders.has(r.slot)) ladders.get(r.slot).push(Number(r.tier));
}
const tierDepth = Math.max(0, ...[...ladders.values()].map((v) => v.length));
for (const [slot, tiers] of ladders) {
    const sorted = [...tiers].sort((a, b) => a - b);
    ok(sorted.length > 0, `tool slot "${slot}" has no recipe at all — a system that can never be fed`);
    ok(new Set(sorted).size === sorted.length, `tool slot "${slot}" has two recipes claiming the same tier`);
    sorted.forEach((t, i) => ok(t === i + 1, `tool slot "${slot}" jumps to tier ${t} with no tier ${i + 1}`));
    // Every ladder climbs together, because a tier IS a map: if any tool reached tier N, that map shipped.
    ok(sorted.length === tierDepth,
        `tool slot "${slot}" stops at tier ${sorted.length} while others reach ${tierDepth} — a map shipped a partial ladder`);
}

// ── 1c. NOTHING IS NAMED TWICE ───────────────────────────────────────────────────────────────────────
// Eleven maps of generated content merge into the same four tables map one hand-wrote, keyed by id. A
// collision does not error: the later entry WINS, which silently replaces a creature, a boss, a material or
// a zone with another map's version of it and points the original's art at the wrong thing.
//
// It has already happened once: the Rotgarden shipped a "husk" and map one has had a Straw Walker with that
// id since the day the Grove opened. Caught by a sweep rather than by anything breaking, which is exactly
// why it is asserted here now.
const idClash = (what, generated, ours) => {
    const mine = new Set(ours);
    for (const id of generated) ok(!mine.has(id), `${what} id "${id}" is used by map one AND by a generated map`);
    const seen = new Set();
    for (const id of generated) {
        ok(!seen.has(id), `${what} id "${id}" is declared twice across the generated maps`);
        seen.add(id);
    }
};
idClash("creature", Object.keys(MAP_ENEMIES), Object.values(GROVE_ENEMIES).filter((e) => (e.map ?? 1) === 1).map((e) => e.id));
idClash("boss", Object.keys(MAP_BOSSES), Object.values(GROVE_BOSSES).filter((b) => (b.map ?? 1) === 1).map((b) => b.id));
idClash("part", Object.keys(MAP_PARTS), Object.entries(GROVE_PARTS).filter(([, p]) => (p.map ?? 1) === 1).map(([id]) => id));
idClash("zone", MAP_ZONES.map((z) => z.id), GROVE_ZONES.filter((z) => (z.map ?? 1) === 1).map((z) => z.id));

// ── 1d. EVERY MATERIAL IS SOMEBODY'S PRIMARY DROP ────────────────────────────────────────────────────
// The rule the world is built on: creature i is the resident of zone i and part i is what that zone is made
// of. If a map ever has more materials than residents, or the two lists drift apart, a material becomes
// unreachable in a way no screen would show — the recipe simply never completes.
for (const m of GROVE_MAPS) {
    if (!m.parts || !m.creatures) continue;
    ok(m.parts.length === m.creatures.length,
        `map ${m.n} (${m.id}) has ${m.parts.length} materials and ${m.creatures.length} creatures — they must pair up`);
    ok(m.zones?.length === 12, `map ${m.n} (${m.id}) has ${m.zones?.length ?? 0} zones, not 12`);
    const roles = new Set(m.parts.map((x) => x.role));
    for (const r of ROLES) ok(roles.has(r), `map ${m.n} (${m.id}) has no "${r}" material — its tools cannot be built`);
    for (const z of m.zones || []) {
        for (const idx of z.foes) ok(m.creatures[idx], `map ${m.n} zone ${z.id} names creature #${idx}, which does not exist`);
        ok(GROVE_BIOMES[z.biome], `map ${m.n} zone ${z.id} has biome "${z.biome}", which is not in GROVE_BIOMES`);
    }
}

// ── 2. EVERY PART IS WANTED ──────────────────────────────────────────────────────────────────────────
// Luke: "Each part you can get from an enemy has uses in at least one recipe."
//
// ⚠️ THE SPARES ARE SPARES ON PURPOSE. A generated map declares twelve materials and its twelve tools use
// eight of them — the other four exist so a zone has something of its own to drop rather than every creature
// on the map handing over the same eight things. They are not litter until a map SHIPS with them unused and
// nothing else to want them, which is a map-one-style authoring question, so the rule applies to built maps.
const wanted = new Set(GROVE_RECIPES.flatMap((r) => Object.keys(r.parts)));
for (const [id, p] of Object.entries(GROVE_PARTS)) {
    if (!mapIsBuilt(p.map ?? 1)) continue;
    ok(wanted.has(id), `part "${id}" drops but no recipe asks for it — litter in a 16-slot bag`);
}

// ── 3. EVERY PART IS REACHABLE ───────────────────────────────────────────────────────────────────────
// The mirror of the rule above: a recipe asking for a part nothing drops is a recipe nobody can ever make.
const dropped = new Set([
    ...Object.values(GROVE_ENEMIES).flatMap((e) => e.loot.map((l) => l.part)),
    ...GROVE_RARE.loot.map((l) => l.part),
]);
// ⚠️ SAME LINE AS THE OTHER TWO RULES. On a BUILT map, a material nothing drops is a recipe nobody can make
// and the gate must say so. On a designed-but-unbuilt map it is the expected state — the creatures that will
// drop it are the next job — and failing here would mean the gate screamed for eleven maps' worth of content
// the moment anyone sketched a ladder. What keeps that honest is MAPS_BUILT: raise it without the zones and
// every one of these fires at once.
for (const [id, p] of Object.entries(GROVE_PARTS)) {
    if (!mapIsBuilt(p.map ?? 1)) continue;
    ok(dropped.has(id), `part "${id}" is in a recipe but nothing drops it`);
}

// ── 4. DIFFICULTY CLIMBS ─────────────────────────────────────────────────────────────────────────────
// ⚠️ BOSS HP IS READ STRAIGHT, NOT THROUGH scaledFoe. A boss is authored at the depth it stands at, so
// putting it through the per-zone climb would compound on a number already written for zone 12.
// ⚠️ AND THE RAMP RESTARTS AT EVERY DOOR, so "harder than the one before it" is only true INSIDE a map.
// The design doc: "35 seconds at the start of a map rising to 80 at the end of it, so tough is a place you
// arrive at. The ramp restarts each map because a boss is the end of ITS map." Map two's first boss is
// meant to be a 35-second fight again — against a hero a whole map stronger — so it is smaller than map
// one's last, and asserting one continuous climb would force the opposite of what the feature wants.
//
// What must still hold, and is checked below: a map climbs from its first boss to its last, and each map's
// FIRST boss is harder than the previous map's first. That is the ladder; the sawtooth is the shape.
let lastHp = 0;
let lastMap = 0;
const firstBossOfMap = {};
for (const z of GROVE_ZONES) {
    const boss = GROVE_BOSSES[z.boss];
    if (!boss) continue;
    const mapN = z.map || 1;
    if (mapN !== lastMap) { lastHp = 0; lastMap = mapN; firstBossOfMap[mapN] = boss.hp; }
    ok(boss.hp > lastHp, `zone ${z.n} (${z.id}): boss is not harder than the one before it in its own map`);
    lastHp = boss.hp;
}

// ── 4b. THE BOSSES THEMSELVES ────────────────────────────────────────────────────────────────────────
for (const [id, b] of Object.entries(GROVE_BOSSES)) {
    ok(GROVE_EMBLEMS[b.emblem], `boss ${id}: unknown emblem "${b.emblem}"`);
    for (const row of b.loot) ok(GROVE_PARTS[row.part], `boss ${id}: unknown part "${row.part}"`);
    // Same rule as the wanderers: the Crystal Stag is the only thing in this feature that mints.
    ok(b.gold === undefined, `boss ${id}: bosses must not pay gold`);
    // Luke asked for "telegraphed attacks". An attack with no wind-up is an unavoidable hit.
    ok(b.attacks?.length > 0, `boss ${id}: no attacks`);
    for (const a of b.attacks || []) {
        ok(a.telegraph > 0, `boss ${id}: attack "${a.kind}" has no telegraph`);
        ok(a.reach > 0, `boss ${id}: attack "${a.kind}" has no reach`);
    }
    // ⚠️ A BOSS PAYS ITS WHOLE TABLE, so a weight on its rows would read as meaningful and decide nothing.
    for (const row of b.loot) ok(row.w === undefined, `boss ${id}: loot row "${row.part}" carries a weight it cannot use`);
}

// ── 4c. ⚠️ EVERY SPRITE PATH POINTS AT A FILE THAT EXISTS ───────────────────────────────────────────
// This is the check that was missing, and four creatures shipped without art because of it: husk, goblin,
// elderling and the Crystal Stag all had art: null while their generated files sat on disk unreferenced.
// A path pointing at nothing is worse — an SSR 404 beats React to the onError event, so the fallback never
// runs and the player gets the browser's broken-image glyph. See img-onerror-fires-before-hydration.
const artMissing = [];
const checkArt = (what, url) => {
    if (!url) { artMissing.push(`${what}: no art at all`); return; }
    if (!fs.existsSync(`public${url}`)) artMissing.push(`${what}: ${url} does not exist`);
};
for (const [id, e] of Object.entries(GROVE_ENEMIES)) checkArt(`enemy ${id}`, e.art);
for (const [id, b] of Object.entries(GROVE_BOSSES)) checkArt(`boss ${id}`, b.art);
checkArt("rare spawn", GROVE_RARE.art);
// Every tool has a picture. A slot whose sprite is missing falls back to a react-icons glyph on screen, so
// nothing LOOKS broken -- which is exactly why it needs a gate: the failure is a generic pickaxe standing in
// for one knapped out of an antler, and nobody would ever file that as a bug.
// Every RUNG has its own picture now, drawn from its own map's materials. Checked per tier rather than per
// slot, because a ladder missing one rung's art falls back to a sprite made of the wrong world and nothing
// on screen says so.
for (const t of TOOL_SLOTS) {
    checkArt(`tool ${t.slot}`, toolArt(t.slot));
    for (const r of GROVE_RECIPES.filter((x) => x.kind === "tool" && x.slot === t.slot)) {
        checkArt(`tool ${t.slot} tier ${r.tier}`, toolArt(t.slot, r.tier));
    }
}
for (const z of GROVE_ZONES) checkArt(`zone ${z.id}`, z.bg);
// ── ⚠️ AND EVERY ZONE IS MADE OF SOMETHING THAT EXISTS ───────────────────────────────────────────
// A zone with no biome, or one naming a biome that is not in the table, falls back to `wood` — so the
// Rotwood would quietly grow leafy vines out of its burnt ledges and nothing anywhere would say so. The
// fallback is there to stop a crash, not to be relied on, and this is what stops it being relied on.
for (const z of GROVE_ZONES) {
    ok(z.biome, `zone ${z.id}: names no biome`);
    ok(!z.biome || GROVE_BIOMES[z.biome], `zone ${z.id}: unknown biome "${z.biome}"`);
    checkArt(`zone ${z.id} ledge`, slabArt(z.biome));
}
// Every sprite a biome is allowed to grow. These paths are derived from the id exactly like the loose
// items are, which means adding a name to a biome's list silently promises a sprite nobody has drawn.
for (const [id, b] of Object.entries(GROVE_BIOMES)) {
    checkArt(`biome ${id} slab`, `/images/grove/slab-${b.slab}.webp`);
    for (const h of b.hang) checkArt(`biome ${id} hang ${h}`, hangArt(h));
    for (const t of b.sit) checkArt(`biome ${id} sit ${t}`, sitArt(t));
    // A biome with nothing to hang is a deliberate statement about the place (the Rotwood is burnt), but
    // one with nothing at all is a ledge as plain as the ones this feature replaced.
    ok(b.hang.length + b.sit.length > 0, `biome ${id}: nothing grows on it at all`);
    ok(b.density > 0 || b.sitDensity > 0, `biome ${id}: zero density, so nothing is ever placed`);
    // ⚠️ AND THE SLAB KNOWS WHERE ITS OWN SURFACE IS. Without an entry the surface falls back to 0, which
    // puts the feet back on the tip of the moss crown — the float Luke reported, silently, for that one
    // biome only. Regenerate the table with scripts/grove-decor-clean.mjs after any slab is redrawn.
    ok(SLAB_SURFACE[b.slab] != null, `biome ${id}: slab "${b.slab}" has no SLAB_SURFACE entry, so bodies float on it`);
    ok(!(SLAB_SURFACE[b.slab] > 0.3), `biome ${id}: slab "${b.slab}" surface ${SLAB_SURFACE[b.slab]} is implausibly deep — remeasure it`);
}
// Nothing drawn should be unreachable: a sprite in the folder that no biome names is art nobody sees.
{
    const named = new Set();
    for (const b of Object.values(GROVE_BIOMES)) {
        for (const h of b.hang) named.add(`hang-${h}`);
        for (const t of b.sit) named.add(`sit-${t}`);
        named.add(`slab-${b.slab}`);
    }
    for (const f of fs.readdirSync("public/images/grove")) {
        const key = f.replace(/\.webp$/, "");
        if (!/^(slab|hang|sit)-/.test(key)) continue;
        ok(named.has(key), `${f} is drawn but no biome names it — art nobody will ever see`);
    }
}
// ⚠️ AND EVERY LOOSE ITEM, BECAUSE ITS PATH IS DERIVED. groveArt builds the path from the id rather than
// reading an authored field, which means adding a part to the catalogue silently promises a sprite that
// nobody has drawn — and the first time anyone sees that promise broken is a broken-image glyph on the
// floor of a live zone. The derivation is only safe with this loop behind it.
// ⚠️ ART IS REQUIRED WHEN THE MAP SHIPS, NOT WHEN THE MATERIAL IS DESIGNED. The materials for maps two to
// twelve are declared so the ladder can be priced and read; drawing 132 sprites for places nobody can walk
// to yet is $5.60 of art against content that may still move. The day a map's zones land, MAPS_BUILT goes
// up and this gate starts demanding its pictures — which is the right moment to be told.
for (const [id, p] of Object.entries(GROVE_PARTS)) {
    if (!mapIsBuilt(p.map ?? 1)) continue;
    checkArt(`part ${id}`, groveArt(id));
}
for (const id of Object.keys(GROVE_EMBLEMS)) checkArt(`emblem ${id}`, groveArt(id));
for (const id of Object.keys(GROVE_FOODS)) checkArt(`food ${id}`, groveArt(id));
// ── ⚠️ AND EVERY PLACE IS ON THE CHART ────────────────────────────────────────────────────────────
// The map draws a symbol per zone at coordinates grove-map.js owns, so a zone added to the catalogue
// without a spot simply does not appear on the map — no error, no gap, it is just missing, and the
// trail quietly routes around where it should have been.
// ⚠️ POSITION IS BY DEPTH NOW, NOT BY ID. Twelve zones to a map and twelve positions on the paper, so
// every map reuses them: ((depth - 1) % 12). Checking ids would demand MAP_LAYOUT grow to 144 entries for
// a chart that only ever shows twelve at a time.
for (const z of GROVE_ZONES) {
    const spot = spotForDepth(z.n);
    ok(spot, `zone ${z.id} (depth ${z.n}): no place on the paper`);
    if (spot) checkArt(`map symbol ${z.id}`, z.node || nodeArt(z.id));
}
for (const m of MAP_LAYOUT) {
    ok(GROVE_ZONES.some((z) => z.id === m.id), `map has a place for unknown zone "${m.id}"`);
}
// Two places drawn on top of each other read as one place with a strange shape. A symbol is 7% of the
// chart wide, so anything inside 6% horizontally AND 10% vertically of another is overlapping it.
for (let i = 0; i < MAP_LAYOUT.length; i += 1) {
    for (let j = i + 1; j < MAP_LAYOUT.length; j += 1) {
        const a2 = MAP_LAYOUT[i];
        const b2 = MAP_LAYOUT[j];
        ok(Math.abs(a2.x - b2.x) >= 6 || Math.abs(a2.y - b2.y) >= 10,
            `map: ${a2.id} and ${b2.id} are drawn on top of each other`);
    }
}

for (const m of artMissing) ok(false, m);

// ── 4d. ⚠️ THE TELEGRAPH MUST KEY ON THE BODY, NOT THE TYPE ─────────────────────────────────────────
// The regression guard for the worst silent bug this feature had. makeTelegraph stored foe.id (the TYPE,
// "rootrat") and the scene resolved it against f.uid (the BODY, "f17-480213"). It never matched, so every
// attack in the Grove fell through to a hardcoded 5 damage — the Elderling's [31, 47], every boss number
// and the entire dmgPerZone climb did nothing, in all twelve zones, and the build was perfectly happy.
{
    const body = { id: "rootrat", uid: "f17-480213", telegraph: 600, dmg: [1, 2] };
    const tels = makeTelegraph(body, 50, 0);
    ok(Array.isArray(tels), "makeTelegraph must return a list (a volley lands in several places)");
    ok(tels[0]?.foeUid === body.uid, "telegraph must key on the body uid, not the enemy type");
    ok(tels[0]?.foeUid !== body.id, "telegraph keyed on the enemy TYPE — this is the flat-5-damage bug");
    // A volley is three bands, centred, with a gap to stand in.
    const volley = makeTelegraph(body, 50, 0, { kind: "volley", reach: 9, telegraph: 800, shots: 3, spread: 22 });
    ok(volley.length === 3, "a 3-shot volley must make 3 telegraphs");
    ok(volley.some((t) => t.x === 50), "a centred volley must put one band on the target");
    ok(Math.max(...volley.map((t) => t.x)) - Math.min(...volley.map((t) => t.x)) > 9 * 2,
        "a volley with no gap between bands is not a telegraph, it is a tax");
}

// ── 4e. THE HYPER-RARE TABLE ─────────────────────────────────────────────────────────────────────────
for (const h of GROVE_HYPER) {
    if (h.kind === "consumable") {
        ok(CONSUMABLES[h.ref], `hyper ${h.id}: unknown consumable "${h.ref}"`);
        // ⚠️ price: null OR IT IS NOT A PRIZE. A hyper-rare you can walk into the shop and buy is a rounding
        // error on your gold, not a once-in-a-thousand-kills moment.
        ok(CONSUMABLES[h.ref]?.price == null, `hyper ${h.id}: "${h.ref}" is purchasable, so it is not a prize`);
    }
    ok(["consumable", "stone", "ship_upgrade"].includes(h.kind), `hyper ${h.id}: kind "${h.kind}" is not handled by grantHyper`);
    ok(h.w > 0 && h.minZone >= 1, `hyper ${h.id}: bad weight or floor`);
}
// ⚠️ THE FLOOR FAILS UPWARD. The deepest boss must be eligible for EVERYTHING, not just its own rung.
// Three bugs in this codebase have been ladders that matched only their own step and fell back to the
// cheapest prize. See ladder-lookups-must-fail-upward.
{
    const atDepth = (z) => {
        const got = new Set();
        for (let i = 0; i < 20000; i += 1) { const x = pickHyper(z, i / 20000, GROVE_HYPER); if (x) got.add(x); }
        return got;
    };
    const deep = atDepth(GROVE_ZONES.length);
    ok(deep.size === GROVE_HYPER.length, `the deepest boss can only win ${deep.size} of ${GROVE_HYPER.length} hyper-rares — the floor is failing downward`);
    let last = 0;
    for (const z of GROVE_ZONES) {
        const n = atDepth(z.n).size;
        ok(n >= last, `zone ${z.n}: fewer hyper-rares available than the zone before it`);
        last = n;
    }
    ok(atDepth(1).size >= 1, "zone 1 bosses can win nothing at all");
}

// ── 4f. THE FARM GRANTS EXIST ────────────────────────────────────────────────────────────────────────
// ⚠️ THE RECIPE ID *IS* THE DECORATION ID. groveCraft hands recipe.id straight to grantDecoration, which
// refuses anything not in the catalogue — so a mismatch here is a craft that spends the parts and gives
// nothing. They were authored to the same key on purpose; this is what holds them there.
// ⚠️ AND THE CATALOGUE MUST NOT CONTAIN THE SAME ID TWICE. It is a flat 129-row array with no key on it,
// and the first Grove decorations were authored as deco_stump and deco_lantern — both of which were already
// taken by common shop props. Nothing errored: DECORATIONS.find returns whichever comes first, so crafting a
// Mothlight Lantern would have handed over a 350-gold Paper Lantern, and the sprite generator redrew the shop
// one. A shared catalogue with duplicate keys is two different items wearing one name.
{
    const seenDeco = new Set();
    for (const d of DECORATIONS) {
        ok(!seenDeco.has(d.id), `decoration id "${d.id}" appears more than once in DECORATIONS`);
        seenDeco.add(d.id);
    }
}
for (const r of GROVE_RECIPES.filter((x) => x.kind === "deco")) {
    const d = DECORATIONS.find((x) => x.id === r.id);
    ok(d, `recipe ${r.id}: no decoration with that id, so the craft would grant nothing`);
    ok(d?.source === "grove", `decoration ${r.id}: source "${d?.source}" — a Grove deco must be unreachable by the shops and the wheel`);
    ok(d?.price == null, `decoration ${r.id}: has a price, so it is also buyable`);
}
ok(GROVE_RECIPES.filter((x) => x.kind === "plot").length === 2, "Luke said two extra plots, ever");

// Each map opens harder than the last one opened. This is the half the sawtooth must not break.
{
    const maps = Object.keys(firstBossOfMap).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < maps.length; i += 1) {
        ok(firstBossOfMap[maps[i]] > firstBossOfMap[maps[i - 1]],
            `map ${maps[i]} opens with an easier boss than map ${maps[i - 1]} did`);
    }
}

// ── 5. THE EMBLEM LADDER FAILS UPWARD ────────────────────────────────────────────────────────────────
// Two of this game's worst bugs were ladders that fell off the end and paid the BOTTOM rung.
// ⚠️ ASSERTED AS PROPERTIES, NOT AS NUMBERS. The first version checked "10 gives 1 star", which was true of
// one particular tuning and started failing the moment the ladder was rebalanced — a test that breaks when
// you tune is a test that teaches you to ignore it. What must hold at ANY tuning: nothing is no stars, the
// first rung is exactly one star, and a huge count keeps the TOP rung rather than falling off the end.
ok(emblemStars(0).stars === 0, "emblem ladder: 0 should be no stars");
ok(emblemStars(EMBLEM_STARS[0].at).stars === 1, "emblem ladder: the first rung should be 1 star");
ok(emblemStars(EMBLEM_STARS[0].at - 1).stars === 0, "emblem ladder: just under the first rung is still 0");
ok(emblemStars(999_999).stars === 6, "emblem ladder: a huge count must keep the TOP rung, not fall to zero");
// And the rungs must climb, or a later one is unreachable.
for (let i = 1; i < EMBLEM_STARS.length; i += 1) {
    ok(EMBLEM_STARS[i].at > EMBLEM_STARS[i - 1].at, `emblem ladder: rung ${i + 1} is not above rung ${i}`);
}

// ── 6. DISCOVERY IS BY SEEN-SET, NOT INVENTORY ───────────────────────────────────────────────────────
const seenAll = new Set(Object.keys(GROVE_PARTS));
ok(discoveredRecipes(seenAll).length === GROVE_RECIPES.length, "seeing every part should unlock every recipe");
ok(discoveredRecipes(new Set()).length === 0, "seeing nothing should unlock nothing");

// ── REPORT ───────────────────────────────────────────────────────────────────────────────────────────
const zones = GROVE_ZONES.length;
const twoTypes = GROVE_ZONES.filter((z) => z.enemies.length > 1).length;
const needArt = [
    ...Object.values(GROVE_ENEMIES).filter((e) => !e.art).map((e) => e.name),
    ...(GROVE_RARE.art ? [] : [GROVE_RARE.name]),
];

console.log(`── THE GROVE ────────────────────────────────────────────────────────────────`);
console.log(`  ${zones} zones (${twoTypes} with two enemy types)   ${Object.keys(GROVE_ENEMIES).length} enemies`);
console.log(`  ${Object.keys(GROVE_PARTS).length} parts   ${GROVE_RECIPES.length} recipes   ${Object.keys(GROVE_EMBLEMS).length} emblems`);
console.log(`  ${TOOL_SLOTS.length} tool slots, tier ${tierDepth} of ${TOOL_TIER_CAP} built: ${TOOL_SLOTS.map((t) => `${t.name} (${t.system})`).join(", ")}`);
console.log(`  population ${GROVE_POP.min}-${GROVE_POP.max}, full respawn every ${GROVE_POP.respawnMs / 1000}s`);
console.log(`  rare spawn: ${GROVE_RARE.name} at ${(GROVE_RARE.spawnChance * 100).toFixed(2)}% per enemy`);
console.log(`  ${Object.keys(GROVE_BOSSES).length} bosses, back up every ${BOSS_COOLDOWN_MS / 60000} min   ${GROVE_HYPER.length} hyper-rares`);
console.log(`\n  difficulty curve (zone boss hp):`);
console.log("   ", GROVE_ZONES.map((z) => GROVE_BOSSES[z.boss].hp).join(" → "));
console.log(`  boss hyper-rare rate: zone 1 ${(bossHyperChance(1) * 100).toFixed(2)}%  ->  zone ${GROVE_ZONES.length} ${(bossHyperChance(GROVE_ZONES.length) * 100).toFixed(2)}%`);
{
    // What the deepest boss actually pays, measured rather than reasoned about - the same discipline the
    // emblem pace table below exists for.
    const N = 120000;
    const deep = GROVE_BOSSES[GROVE_ZONES[GROVE_ZONES.length - 1].boss];
    const hc = bossHyperChance(GROVE_ZONES.length);
    let hits = 0;
    const tally = {};
    for (let i = 0; i < N; i += 1) {
        const g = rollBoss(deep, GROVE_ZONES.length, 4242, i, {}, hc, GROVE_HYPER);
        if (g.hyper) { hits += 1; tally[g.hyper] = (tally[g.hyper] || 0) + 1; }
    }
    const hours = ((N / hits) * (BOSS_COOLDOWN_MS / 3600000)).toFixed(0);
    console.log(`    1 in ${Math.round(N / hits)} kills of ${deep.name} = about ${hours}h of fighting only him`);
    const rarest = Object.entries(tally).sort((a2, b2) => a2[1] - b2[1])[0];
    console.log(`    rarest of them: ${rarest[0]} at 1 in ${Math.round(N / rarest[1])} boss kills`);
}
// ── ⚠️ WHAT "RARE" ACTUALLY COSTS, IN SESSIONS ───────────────────────────────────────────────────────
// The drop rate and the star ladder are one number living in two places, and either alone looks perfectly
// reasonable while the PAIR is absurd — 1% a kill against a 1,200 ladder is a hundred thousand kills for six
// stars. So the timeline is printed rather than reasoned about, and any future tuning change shows its own
// consequence on the way past.
const KILLS_PER_SESSION = 500;   // ~20 active minutes against 15-30 enemies refreshing every 45s
console.log(`\n  emblem pace (at ${KILLS_PER_SESSION} kills/session):`);
for (const id of ["rootrat", "thornling", "elderling"]) {
    const e = GROVE_ENEMIES[id];
    const per = e.emblemChance * KILLS_PER_SESSION;
    const row = EMBLEM_STARS.map((r) => `${r.star}*${Math.ceil(r.at / per)}`).join("  ");
    console.log(`    ${e.name.padEnd(13)} ${(e.emblemChance * 100).toFixed(2)}%/kill  ${per.toFixed(2)}/session   sessions to: ${row}`);
}

console.log(`\n  art still to draw (${needArt.length}): ${needArt.join(", ") || "none"}`);
console.log(`  backdrops to draw: ${zones} (one per zone)`);

// ── ⚠️ IS THE HERO ACTUALLY ON THE SCREEN? ─────────────────────────────────────────────────────────
// The content checks above are about strings that can be wrong without throwing. This one is about NUMBERS
// that can be wrong without throwing, which turned out to be the more expensive kind.
//
// Three distances in the scene were tuned as bare constants against a frame about 100 world units wide —
// the camera lookahead (14), the pet’s trail (9), and the tap handler’s own copy of the scale. Each one is
// really a SHARE OF THE FRAME wearing world-space clothes. When the scale changed so the hero would be big
// enough to see, the frame became 26 units and all three quietly changed meaning: the camera led the hero by
// more than half the screen and settled with him at x = -65, the pet rode the left bezel until it fell off
// it, and a tap asked for half the distance it pointed at. Nothing errored. It photographs as an empty
// forest, which is indistinguishable from a feature that is simply broken.
//
// So: run the real geometry at the real viewport sizes and assert the two things a player would notice.
// Reading the component would never have shown this; only putting numbers through it does.
// ── ⚠️ EVERY CLASS NODE EITHER COUNTS IN A ZONE OR IS NAMED HERE AS NOT COUNTING ───────────────────────────
// Luke: "all choices on your class must be honored."
//
// grove-kit's forGrove() is an ALLOWLIST, and an allowlist forgotten as the data grows is the bug that cost
// The Long Road a hundred unpaid fights and that treeAbilities carries a warning about. It was doing it
// again: fighterFrom computes every tree stat correctly, the ring applies them, and forGrove named fourteen
// fields -- so a Warden could spend twelve nodes and have two of them mean anything in here, silently, with
// a screen that said nothing either way.
//
// This asks the engine the same question grove-kit does and prints the answer every run. A node that moves
// no Grove number must be named in NOT_IN_THE_GROVE with the mechanic it is waiting on; anything else fails
// the build. So the gap is a list somebody chose rather than a thing nobody knew.
const GROVE_FIELDS = ["damage", "critChance", "critMult", "tempo", "haste", "lifesteal", "lifestealBonus",
    "hasteBonus", "stun", "bleedChance", "bleedDamage", "bleedLeech", "armor", "health", "dmgPct", "might"];
// The mechanic each one is waiting for. Shrinking this list is the work; adding to it is a decision.
const NOT_IN_THE_GROVE = {
    counterBonus: "no counter-attack in a side-scroller yet",
    stunBonus: "the hero has stun points and nothing in a zone reads them",
    wildProc: "no wild proc",
    blockChance: "no block", blockReductionBonus: "no block",
    guardChance: "no guard", guardSize: "no guard",
    regen: "no heal-over-time on the hero", grudge: "no grudge", thorns: "no reflect",
    burnChance: "no burn (the bleed machine could carry it)", burnDamage: "no burn", burnLeech: "no burn",
    freeze: "no freeze", chill: "no slow", iceThorns: "no reflect",
    ward: "no absorb shield", wardRefill: "no absorb shield",
    surge: "no surge", soulfire: "no soulfire", cataclysm: "no cataclysm",
};
{
    // A realistic build: a multiplier on a zero base looks inert and is not.
    const S = { might: 300, vitality: 250, armor: 180, crit_chance: 0.2, crit_power: 0.6,
        lifesteal: 12, ferocity: 40, tenacity: 30, haste: 25, stun: 10 };
    const base = fighterFrom(S, {}, null);
    const inert = [];
    for (const c of CLASSES) {
        for (const n of treeFor(c.id)) {
            if (!n.stat) continue;
            const f = fighterFrom(S, { [n.stat]: (n.per || 0) * (n.ranks || 1) || 1 }, null);
            const moved = GROVE_FIELDS.some((k) => Math.abs((Number(f[k]) || 0) - (Number(base[k]) || 0)) > 1e-9);
            if (moved) continue;
            if (!NOT_IN_THE_GROVE[n.stat]) {
                fail.push(`${c.name}'s ${n.name} (${n.stat}) moves no Grove number and is not named in NOT_IN_THE_GROVE — a class node nobody can spend points in`);
            } else inert.push(`${c.name} ${n.name} — ${NOT_IN_THE_GROVE[n.stat]}`);
        }
    }
    const total = CLASSES.reduce((a, c) => a + treeFor(c.id).filter((n) => n.stat).length, 0);
    console.log(`
  class nodes honoured in the Grove: ${total - inert.length}/${total}`);
    for (const line of inert) console.log(`    waiting:  ${line}`);
}

const VIEWPORTS = [
    [360, 640, "small phone"],
    [390, 844, "phone portrait"],
    [428, 926, "large phone"],
    [844, 390, "phone landscape"],
    [820, 1180, "tablet portrait"],
    [1180, 820, "tablet landscape"],
    [1512, 860, "laptop"],
    [1920, 1080, "desktop full"],
    [3440, 1440, "ultrawide"],
];

console.log("\n  the scene, laid out:");
console.log("    viewport        unit  across  hero px  vs grass  upscale  across");
for (const [vw, vh, label] of VIEWPORTS) {
    // The deepest zone: three tiers of ledges, the top one 78 units up, seven screens wide.
    const v = viewFor(vw, vh, 78);
    const heroX = 40;
    const cam = cameraX(heroX, 1, v.visibleUnits, 700);
    const pf = petFollow(v.visibleUnits);
    // Both bodies are centred on their world x by a negative margin of half their width.
    const hx = screenX(heroX, cam, v.unit) - (HERO_UNITS / 2) * v.unit;
    const px = screenX(heroX - pf.trail, cam, v.unit) - (PET_UNITS / 2) * v.unit;
    const tilesNeeded = 2 + Math.ceil(vw / v.tileW);

    const onScreen = (x, units) => x >= 0 && x + units * v.unit <= vw;
    if (!onScreen(hx, HERO_UNITS)) fail.push(`${label} ${vw}x${vh}: the HERO renders at x=${hx.toFixed(0)}, off the frame`);
    if (!onScreen(px, PET_UNITS)) fail.push(`${label} ${vw}x${vh}: the PET renders at x=${px.toFixed(0)}, off the frame`);
    // The strip wraps on two tiles, so it must cover the frame plus a full two-tile period.
    if (tilesNeeded > SKY_TILE_COUNT) fail.push(`${label} ${vw}x${vh}: needs ${tilesNeeded} backdrop tiles, only ${SKY_TILE_COUNT} are rendered — the strip runs out and the zone shows bare scene behind it`);
    // ⚠️ THE ANT TEST. Luke: "What am I an ant in a forest of grass". The hero has to stand TALLER
    // than the painted foreground band, or he is wading through grass drawn for something beetle-sized and
    // no sprite size rescues him. This is the single number that decides whether he reads as a person.
    if (v.heroOverGround < 1.15) fail.push(`${label} ${vw}x${vh}: the hero is ${v.heroPx.toFixed(0)}px against a ${v.groundPx.toFixed(0)}px band of painted ground — he is ${v.heroOverGround < 1 ? "SHORTER THAN THE GRASS" : "barely over it"}`);
    // ⚠️ AND THE BACKDROP MUST NOT BE STRETCHED TO ACHIEVE IT. Scaling the plate up is what made the
    // grass tall in the first place, and it also turns a 1536px painting to mush beside crisp sprites.
    // The stretch is now a function of viewport HEIGHT alone (skyBoxH = 1.12 x vh against a 1024px source),
    // so a screen taller than about 1550px will pass 1.7 no matter what the layout does. That is the art
    // resolution talking, not a bug — gpt-image-1 caps landscape plates at 1536x1024.
    if (v.plateUpscale > 1.7) fail.push(`${label} ${vw}x${vh}: the backdrop is stretched ${v.plateUpscale.toFixed(2)}x — it will look soft next to the sprites`);
    // A hero nobody can see is the bug this whole file is about.
    if (v.heroPx < 60) fail.push(`${label} ${vw}x${vh}: the hero is ${v.heroPx.toFixed(0)}px tall`);

    // ── ⚠️ AND NOTHING MAY REACH SOMEWHERE THE PLAYER CANNOT SEE ──────────────────────────────────
    // Three ranges were flat world constants tuned on a landscape screen -- the pet's fetch at 26, the
    // boss's notice at 34, the pet rescue at 30 -- and every one of them was WIDER THAN A PORTRAIT
    // PHONE'S WHOLE FRAME. The pet walked off the right edge to collect loot and came back; the boss
    // announced itself, with a bar and a shake and a banner, while still nineteen units off camera.
    // Neither errors, and both read to a player as the game being broken rather than badly framed.
    //
    // The camera settles the hero near the middle, so half the frame is what he can see in either
    // direction. An errand that goes further than that happens off screen by definition.
    const half = v.visibleUnits / 2;
    const fetch = fetchRangeFor(v.visibleUnits);
    if (fetch > half) fail.push(`${label} ${vw}x${vh}: the pet will fetch ${fetch.toFixed(1)} units away on a frame that only shows ${half.toFixed(1)} either side — it collects loot off screen`);
    // The notice may land a little beyond the edge: the boss should be announced as it ARRIVES, which
    // means the banner fires a moment before it is fully in shot, not a screen and a half earlier.
    const notice = bossNoticeFor(v.visibleUnits);
    if (notice > half * 1.35) fail.push(`${label} ${vw}x${vh}: the boss announces itself ${notice.toFixed(1)} units out with only ${half.toFixed(1)} visible — the banner fires at nothing`);
    // And the rescue must not fire on a pet that is merely lagging, which is anything still in frame.
    const lost = petLostFor(v.visibleUnits);
    if (lost < half) fail.push(`${label} ${vw}x${vh}: the pet is teleported after ${lost.toFixed(1)} units while ${half.toFixed(1)} is still on screen — it vanishes in plain sight`);

    console.log(`    ${label.padEnd(16)}${v.unit.toFixed(1).padStart(4)}${v.visibleUnits.toFixed(0).padStart(8)}${v.heroPx.toFixed(0).padStart(9)}${v.heroOverGround.toFixed(2).padStart(10)}x${v.plateUpscale.toFixed(2).padStart(9)}x${v.visibleUnits.toFixed(0).padStart(8)}`);
}

// ⚠️ AND THE VERTICAL CAMERA MUST REACH THE TOP LEDGE. The clamp this replaced guaranteed every ledge
// was on screen by shrinking everything; the camera has to earn that back by actually climbing. A zone whose
// top tier cannot be brought into frame is a zone with unreachable-looking platforms.
for (const [vw, vh, label] of VIEWPORTS) {
    const v = viewFor(vw, vh, 78);
    const camY = cameraY(78, v.skyUnits);
    const headroom = camY + v.skyUnits - (78 + HERO_UNITS);
    if (headroom < 0) fail.push(`${label} ${vw}x${vh}: standing on the top ledge puts the hero ${(-headroom).toFixed(1)} units above the frame`);
}

if (fail.length) {
    console.log(`\n── ${fail.length} PROBLEM(S) ───────────────────────────────────────────────────`);
    for (const f of fail) console.log("  ·", f);
    process.exit(1);
}
console.log("\nOK — every reference resolves, every part is wanted and reachable, nothing pays gold but the rare spawn.");
