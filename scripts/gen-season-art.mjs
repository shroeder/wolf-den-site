// ── EVERY PICTURE A SEASON NEEDS, IN ONE COMMAND ─────────────────────────────────────────────────────────────
// A season is eight prizes across four subsystems, and each of those four already knows how to draw its own
// kind of thing — the item pipeline resizes to 384 and matches 334 existing icons, the cooking one asks for a
// plated dish rather than a trinket, the decoration one runs the game's own generateDecorationSprite so the
// prop comes out de-haloed and die-cut like the other 155. Writing a fifth pipeline here would produce art
// that is subtly not the house style and nobody would be able to say why.
//
// So this does not reimplement any of them. It works out what the season needs, then DRIVES the three existing
// scripts with the right ids, and generates only the one kind nothing else covers: pet sprites, which are five
// images each (the base plus four evolved forms) and are keyed off a prompt builder in pet-sprite.js rather
// than off a catalog field.
//
// ⚠️ EVERY SPRITE, SAME SESSION. Half a season's art is worse than none — a track with two drawn tiles and six
// grey boxes reads as broken rather than as unfinished, and the missing six are always the ones nobody comes
// back to. This generates all of them, and reports what failed loudly enough to re-run.
//
// COST. Sixteen images at `medium` on gpt-image-1 is roughly sixty cents. Price it before running it over more
// than one season; `--dry` lists what it would draw and spends nothing.
//
// Usage:
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-season-art.mjs            (the current season)
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-season-art.mjs --season 1
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-season-art.mjs --dry
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-season-art.mjs --only pet
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = readFileSync("../accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
process.env.BLOB_READ_WRITE_TOKEN ||= env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
process.env.OPENAI_API_KEY ||= readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8")
    .match(/^OPENAI_API_KEY=(.*)$/m)[1].trim();

const realLog = console.log;
console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith('{"timestamp"')) return; realLog(...a); };

const arg = (flag, dflt = null) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : dflt; };
const DRY = process.argv.includes("--dry");
const ONLY = arg("--only", null);
const QUALITY = arg("--quality", "medium");

const { SEASONS, currentSeason } = await import("@/lib/marketplace/arena-season.js");
const wantN = arg("--season", null);
const season = wantN ? SEASONS.find((s) => s.n === Number(wantN)) : currentSeason();
if (!season) { realLog(`no season ${wantN}`); process.exit(1); }

const prizes = (season.prizes || []).filter((p) => !ONLY || p.kind === ONLY);
realLog(`\nSeason ${season.n} — ${season.name}`);
for (const p of prizes) realLog(`  rung ${String(p.rung).padStart(3)}  ${p.kind.padEnd(11)} ${p.ref.padEnd(26)} ${p.name}`);

const byKind = (k) => prizes.filter((p) => p.kind === k).map((p) => p.ref);
const petRefs = byKind("pet");
const images = byKind("decoration").length + byKind("gear").length + byKind("recipe").length + petRefs.length * 5;
realLog(`\n${images} image${images === 1 ? "" : "s"} to draw at quality "${QUALITY}".`);
if (DRY) { realLog("--dry: nothing generated, nothing stored.\n"); process.exit(0); }

const failed = [];

// ── THE THREE THAT ALREADY HAVE A SCRIPT ─────────────────────────────────────────────────────────────────────
// Driven as child processes rather than imported, because each of those files does its whole job at module
// scope — importing one to borrow its prompt builder would run its entire batch as a side effect.
function drive(label, args) {
    realLog(`\n── ${label} ─────────────────────────────────────────────`);
    const r = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
    if (r.status !== 0) failed.push(label);
}

if (byKind("decoration").length) {
    // One decoration at a time — that script takes a single id, deliberately (it prints the prompt it is about
    // to send so a prop can be judged before it is paid for).
    for (const ref of byKind("decoration")) {
        drive(`decoration ${ref}`, ["--import", "./scripts/lib/register-loader.mjs", "scripts/gen-deco-sprite.mjs", ref, "--quality", QUALITY]);
    }
}
if (byKind("gear").length) drive("gear", ["scripts/gen-item-sprites.mjs", ...byKind("gear")]);
if (byKind("recipe").length) drive("dishes", ["scripts/gen-cooking-sprites.mjs", ...byKind("recipe")]);

// ── THE PETS, WHICH NOTHING ELSE DRAWS ───────────────────────────────────────────────────────────────────────
// Five images each. The base sprite and the four evolved forms are what make levelling a pet visible, and a
// season pet that never changes shape is the one companion in the game that does not grow.
//
// The prompts come from pet-sprite.js, which is where the in-app generator gets them — the POSE line in
// particular is load-bearing (a pet fights on your side, so it must face RIGHT, toward the foe) and a copy of
// it here would be the copy that goes stale.
if (petRefs.length) {
    realLog("\n── pets ─────────────────────────────────────────────");
    // ── THROUGH THE GAME'S OWN GENERATORS, NOT A COPY OF THEM ────────────────────────────────────────────
    // The first cut of this hand-wrote the upserts, copied from an older script, and every one of the eight
    // evolved sprites died on 42P10: the primary key on mkt_pet_sprite_level is (pet_id, level, VARIANT), and
    // Postgres does not accept a conflict target that names two of three columns. That exact bug already has a
    // tombstone in pet-sprite.js — "nobody had run it since variant landed" — and copying the script that
    // predates the fix walked straight back into it.
    //
    // generatePetSpriteLevel also does something no copy of mine would have: it EDITS FROM the Lv1 image
    // rather than re-reading the text description, so the five forms are one creature at five ages instead of
    // five separate readings of a sentence. That is the difference between a pet that evolves and a pet that
    // changes into something else every level.
    const { generatePetSprite, generatePetSpriteLevel, PET_SPRITE_LEVELS } = await import("@/lib/marketplace/pet-sprite.js");
    const { db } = await import("@/lib/db");

    for (const ref of petRefs) {
        // The base first, and only if it is missing — the level art is an EDIT of it, so a level generated
        // without a base silently falls back to the text prompt and drifts.
        const have = await db.queryOne(`SELECT url FROM mkt_pet_sprite WHERE pet_id = $1`, [ref]).catch(() => null);
        if (!have?.url) {
            try { await generatePetSprite(ref); realLog(`✓ ${ref} base`); }
            catch (e) { failed.push(`${ref} base`); realLog(`✗ ${ref} base: ${e.message}`); continue; }
        } else {
            realLog(`· ${ref} base already drawn`);
        }
        for (const lv of PET_SPRITE_LEVELS) {
            try { await generatePetSpriteLevel(ref, lv); realLog(`✓ ${ref} Lv${lv}`); }
            catch (e) { failed.push(`${ref} Lv${lv}`); realLog(`✗ ${ref} Lv${lv}: ${e.message}`); }
        }
    }
}

realLog("");
if (failed.length) {
    realLog(`FAILED (${failed.length}): ${failed.join(", ")}`);
    realLog("Re-run with --only <kind> to retry just that group.");
    realLog("NOTE: a failure after the draw has still been PAID FOR — the image exists on Blob, only the row");
    realLog("is missing. Retrying redraws it, so fix the cause before re-running rather than looping on it.");
    process.exit(1);
}
realLog(`Season ${season.n} art complete — ${images} images.\n`);
process.exit(0);
