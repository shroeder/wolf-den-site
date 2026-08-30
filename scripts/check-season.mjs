// ── DOES THE SEASON'S PRIZE TABLE POINT AT ANYTHING? ─────────────────────────────────────────────────────────
// A season is eight promises made on a screen and kept by four different subsystems, and every one of the ways
// it can break is SILENT:
//
//   · a `ref` that does not resolve → grantRoadPrize throws, deletes its own claim, and the member who just
//     walked to rung 200 gets nothing and no error. The only sign is a line in the server log.
//   · a prize on a rung the Road does not have → nothing ever grants it, and the track draws it forever as
//     "175 rungs away" on a road that stops at 100.
//   · an exclusive that is reachable another way → the whole point of the season evaporates, quietly, because
//     every random reward path in the game builds its pool by filtering a catalog. The Petting Stand's note
//     lists six such paths for decorations alone.
//   · a season live while its content is hidden (or the reverse) → the Road opens onto eight prizes nobody
//     can see, or the Den browses eight exclusives behind a door that is shut.
//
// None of those throws. None of them shows up in a build. So they get a check.
//
// Run:  npm run check:season
import { SEASONS, SEASON_PUBLIC, SEASON_HIDDEN, MILESTONE_RUNGS, PRIZE_KINDS } from "../src/lib/marketplace/arena-season.js";
import { LADDER_MAX } from "../src/lib/marketplace/arena-ladder.js";
import { DECORATIONS } from "../src/lib/marketplace/decorations.js";
import { SEASON_RECIPES, RECIPES, MASTER_RECIPES, recipeById } from "../src/lib/marketplace/cooking-recipes.js";
import { ITEMS, randomDropPool } from "../src/lib/marketplace/items.js";
import { COLLECTIBLES, PUBLIC_COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";

const problems = [];
const fail = (head, why, lines, fix) => problems.push({ head, why, lines, fix });

const decoById = new Map(DECORATIONS.map((d) => [d.id, d]));
const itemById = new Map(ITEMS.map((i) => [i.id, i]));
const petById = new Map(COLLECTIBLES.map((c) => [c.id, c]));

// ── 1. THE EIGHT LAND WHERE THE SCREEN DRAWS THEM ────────────────────────────────────────────────────────────
for (const s of SEASONS) {
    const rungs = (s.prizes || []).map((p) => p.rung);
    const wrong = rungs.filter((r) => !MILESTONE_RUNGS.includes(r));
    if (wrong.length || rungs.length !== MILESTONE_RUNGS.length) {
        fail(`Season ${s.n} (${s.name}) does not have the eight milestones`,
            "milestoneTrack draws whatever is in `prizes`, and grantRoadPrize only fires on a rung a member can win.",
            [`has ${rungs.length}: ${rungs.join(", ")}`, `expected: ${MILESTONE_RUNGS.join(", ")}`],
            "Fix the prize list in src/lib/marketplace/arena-season.js.");
    }
    const beyond = rungs.filter((r) => r > LADDER_MAX);
    if (beyond.length) {
        fail(`Season ${s.n} puts a prize past the end of the Road`,
            `The Road stops at rung ${LADDER_MAX}. A prize above it can never be granted by anything.`,
            beyond.map((r) => `rung ${r}`), "Lower the rung, or lengthen the Road.");
    }
    const kinds = (s.prizes || []).map((p) => p.kind).filter((k) => !PRIZE_KINDS[k]);
    if (kinds.length) {
        fail(`Season ${s.n} has a prize kind nothing can hand over`,
            "handOver() in road-prizes.js switches on `kind` and throws on anything it does not know.",
            [...new Set(kinds)], "Use one of: " + Object.keys(PRIZE_KINDS).join(", "));
    }
}

// ── 2. EVERY REF RESOLVES ────────────────────────────────────────────────────────────────────────────────────
const missing = [];
for (const s of SEASONS) {
    for (const p of s.prizes || []) {
        const found = p.kind === "decoration" ? decoById.get(p.ref)
            : p.kind === "gear" ? itemById.get(p.ref)
                : p.kind === "pet" ? petById.get(p.ref)
                    : p.kind === "recipe" ? recipeById(p.ref) : null;
        if (!found) missing.push(`S${s.n} rung ${p.rung}  ${p.kind.padEnd(11)} ${p.ref}`);
    }
}
if (missing.length) {
    fail(`${missing.length} season prize${missing.length === 1 ? "" : "s"} point at nothing`,
        "grantRoadPrize throws, releases its own claim, and the member gets silence at the top of the climb.",
        missing, "Author the entry in its catalog, or fix the ref.");
}

// ── 3. NOTHING ELSE CAN HAND ONE OVER ────────────────────────────────────────────────────────────────────────
// The exclusivity is enforced by SOURCE in three of the four catalogs and by BOOK MEMBERSHIP in the fourth,
// and each is a different mechanism — so each is checked against its own mechanism rather than against a flag.
const leaks = [];
for (const s of SEASONS) {
    for (const p of s.prizes || []) {
        if (p.kind === "decoration") {
            const d = decoById.get(p.ref);
            // Six hand-out paths, every one of them keyed on `source` — see the note above the Petting Stand.
            if (d && d.source !== "season") leaks.push(`${p.ref}  source "${d.source}" is a hand-out path`);
            if (d && d.price) leaks.push(`${p.ref}  has a price, so the shop can sell it`);
        }
        if (p.kind === "gear") {
            const i = itemById.get(p.ref);
            if (i && i.source !== "season") leaks.push(`${p.ref}  source "${i.source}" is not season-locked`);
            if (i && randomDropPool().some((x) => x.id === i.id)) leaks.push(`${p.ref}  is in randomDropPool`);
        }
        if (p.kind === "pet") {
            const c = petById.get(p.ref);
            if (c && c.source !== "road") leaks.push(`${p.ref}  source "${c.source}" is a pet drop pool`);
        }
        if (p.kind === "recipe") {
            // Being absent from BOTH rollable books IS the lock — learnRecipe's roll takes the book it is
            // given, and neither book contains these. Present in BOOK only, so recipeById still resolves it.
            if (RECIPES.some((r) => r.id === p.ref)) leaks.push(`${p.ref}  is in RECIPES, so any roll can hand it out`);
            if (MASTER_RECIPES.some((r) => r.id === p.ref)) leaks.push(`${p.ref}  is in MASTER_RECIPES, rollable by anyone holding the book`);
            if (!SEASON_RECIPES.some((r) => r.id === p.ref)) leaks.push(`${p.ref}  is not in SEASON_RECIPES`);
        }
    }
}
if (leaks.length) {
    fail(`${leaks.length} season exclusive${leaks.length === 1 ? " is" : "s are"} reachable another way`,
        "A prize you can win from the wheel is not a reason to walk two hundred rungs.",
        leaks, "Move it to the season-only source, or take it off the prize list.");
}

// ── 3b. A SEASON RECIPE CAN ACTUALLY BE COOKED ───────────────────────────────────────────────────────────────
// ingredientMeta falls back to `{ kind: "crop", name: ref }` for anything it does not recognise — a real
// object with a plausible shape — so a typo in a `need` key does not throw, it renders as a crop nobody can
// grow and the recipe is uncookable forever. Same failure mode as the pet "Companion" fallback.
const badNeed = [];
{
    const { PREPS, BAITS } = await import("../src/lib/marketplace/cooking.js").catch(() => ({}));
    // A crop's ingredient ref IS its seed id — see cropMeta, which looks it up in SEEDS. There is no CROPS
    // export, and importing one gives `undefined`, which spreads to nothing and reports every crop as unknown.
    const { SEEDS } = await import("../src/lib/marketplace/farm-crops.js").catch(() => ({}));
    const fishing = await import("../src/lib/marketplace/fishing.js").catch(() => ({}));
    const fish = fishing.FISH || fishing.SPECIES || [];
    const known = new Set([
        ...Object.keys(PREPS || {}), ...Object.keys(BAITS || {}),
        ...Object.keys(SEEDS || {}), ...(Array.isArray(fish) ? fish.map((f) => f.id) : Object.keys(fish)),
    ]);
    if (known.size > 20) {
        for (const r of SEASON_RECIPES) {
            for (const ref of Object.keys(r.need || {})) if (!known.has(ref)) badNeed.push(`${r.id}  needs "${ref}", which is not a prep, bait, crop or fish`);
        }
    }
}
if (badNeed.length) {
    fail("A season recipe asks for an ingredient that does not exist",
        "ingredientMeta falls back silently, so the card renders and the dish can never be cooked.",
        badNeed, "Fix the `need` key in SEASON_RECIPES.");
}

// ── 4. AND THE SAME THING IS NEVER GIVEN TWICE ───────────────────────────────────────────────────────────────
const seen = new Map();
for (const s of SEASONS) {
    for (const p of s.prizes || []) {
        const at = seen.get(p.ref);
        if (at) leaks.push(`${p.ref}  in season ${at} and season ${s.n}`);
        seen.set(p.ref, s.n);
    }
}
const dupes = [...seen.entries()].length !== SEASONS.reduce((n, s) => n + (s.prizes || []).length, 0);
if (dupes) {
    fail("A prize appears in more than one season",
        '"Season exclusive" is the whole product. A second season handing over the same pet retires the first one\'s.',
        [...seen.keys()], "Author new content for the new season.");
}

// ── 5. THE DOOR AND THE SHELF AGREE ──────────────────────────────────────────────────────────────────────────
// One switch drives both, so this can only fail if somebody has hard-coded one of them — which is exactly the
// mistake the single switch exists to prevent, and therefore the one worth asserting.
const shelfWrong = [];
for (const s of SEASONS) {
    for (const p of s.prizes || []) {
        if (p.kind === "decoration") {
            const d = decoById.get(p.ref);
            if (d && Boolean(d.unreleased) !== SEASON_HIDDEN) shelfWrong.push(`${p.ref}  unreleased=${Boolean(d.unreleased)}`);
        }
        if (p.kind === "pet") {
            const c = petById.get(p.ref);
            if (c && Boolean(c.ownerOnly) !== SEASON_HIDDEN) shelfWrong.push(`${p.ref}  ownerOnly=${Boolean(c.ownerOnly)}`);
            const shown = PUBLIC_COLLECTIBLES.some((x) => x.id === p.ref);
            if (shown === SEASON_HIDDEN) shelfWrong.push(`${p.ref}  ${shown ? "is public" : "is hidden"} while SEASON_PUBLIC=${SEASON_PUBLIC}`);
        }
    }
}
if (shelfWrong.length) {
    fail("The season's door and its shelf disagree",
        `SEASON_PUBLIC is ${SEASON_PUBLIC}, so every season-exclusive row should be ${SEASON_HIDDEN ? "hidden" : "visible"}.`,
        shelfWrong, "They all read SEASON_HIDDEN — something has been hard-coded.");
}

if (problems.length) {
    for (const p of problems) {
        console.error(`\n✗ ${p.head}`);
        console.error(`  ${p.why}\n`);
        for (const l of p.lines) console.error(`    ${l}`);
        console.error(`\n  ${p.fix}`);
    }
    process.exit(1);
}

const total = SEASONS.reduce((n, s) => n + (s.prizes || []).length, 0);
console.log(`check:season — ${SEASONS.length} season(s), ${total} prizes, every ref resolves and none of them is`);
console.log(`  reachable by any other path. SEASON_PUBLIC = ${SEASON_PUBLIC}${SEASON_PUBLIC ? "" : " (owner-only; the whole shelf is hidden)"}.`);
