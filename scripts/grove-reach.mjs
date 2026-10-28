// ── HOW FAR DOES A GIVEN PLAYER ACTUALLY GET IN THE GROVE? ───────────────────────────────────────────────────
// Luke: "we also need to drive my player through all of the maps to see how far he can get."
//
// grove-curve.mjs answers the opposite question — given two anchors, what should the curve BE. This one takes
// the curve as shipped and walks a real member down it zone by zone until the fight stops being winnable,
// then prints where that happened.
//
// ⚠️ AND IT PROFILES A BRAND-NEW ACCOUNT TOO, WHICH IS THE NUMBER THAT MATTERS FOR THE TOWN PLAN. The shipped
// curve's LOW anchor is Littlewolf — an established member with gear, pets and badges. Under the town plan
// the Grove becomes the first thing a new account touches, with every other system still locked, so the
// player meeting zone 1 is far below the anchor zone 1 was built for. This measures that gap instead of
// assuming it.
//
//   node scripts/grove-reach.mjs                      Luke, the top, the low anchor, and a fresh account
//   node scripts/grove-reach.mjs "Display Name" ...   whoever you ask for
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const pick = (f, k) => readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${k}=`)).slice(k.length + 1).trim();
process.env.DATABASE_URL = pick("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const { db } = await import("@/lib/db.js");
const { groveFighter } = await import("@/lib/marketplace/grove-kit.js");
const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");
const { GROVE_SCALE, GROVE_ZONES, GROVE_BOSSES, scaledFoe } = await import("@/lib/marketplace/grove-catalog.js");
const { GROVE_MAPS, MAPS_BUILT } = await import("@/lib/marketplace/grove-maps.js");

const SWING_MS = 410;
const ZPM = GROVE_SCALE.zonesPerMap;

// The same measurement grove-curve uses: run the real swing() a few thousand times so crit and bleed are
// measured rather than assumed. Seeded, so two runs of this script compare.
function rate(f) {
    let st = 7; const rand = () => (st = (st * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let tot = 0, bl = 0; const n = 4000;
    for (let i = 0; i < n; i += 1) { const h = swing(f, 0, rand); tot += h.dealt; if (h.bleed) bl += h.bleed.dmg * BLEED_TICKS; }
    const cd = SWING_MS / Math.max(0.2, f.tempo);
    return { perSwing: tot / n, dps: ((tot + bl) / n) / (cd / 1000), cd, ehp: f.health / (1 - drFrom(f.armor, 0)) };
}

// ⚠️ "CAN HE WIN" IS A TIME QUESTION, NOT A DAMAGE ONE. Nothing here can kill the player outright; a wanderer
// that takes four minutes to drop is not a difficulty, it is a player closing the tab. So the wall is defined
// as the two things a person actually feels: how long one ordinary enemy takes, and how long the zone boss
// takes. The thresholds are deliberately generous — this is looking for the cliff, not the discomfort.
const TRASH_WALL = 25;    // seconds to kill ONE wanderer
const BOSS_WALL = 300;    // seconds to kill the zone boss

async function reach(label, buyerId) {
    const f = await groveFighter(buyerId);
    const r = rate(f);
    let wall = null;
    const marks = [];
    for (let map = 1; map <= MAPS_BUILT && !wall; map += 1) {
        for (let zone = 1; zone <= ZPM; zone += 1) {
            const depth = (map - 1) * ZPM + zone;
            const z = GROVE_ZONES[depth - 1];
            if (!z) break;
            // The TOUGHEST resident of the zone, not an average: the wall is where a player gets stuck, and
            // they get stuck on the worst thing in the room, not on the mean of the roster.
            const foeHp = Math.max(...z.enemies.map((e) => scaledFoe(e, depth)?.hp || 0));
            // ⚠️ A BOSS IS AUTHORED AT ITS OWN DEPTH and must NOT be run through scaledFoe — the catalogue
            // says so in as many words, and scaling it would compound a climb already baked into the number.
            const bossHp = GROVE_BOSSES[z.boss]?.hp || 0;
            const trashS = foeHp / r.dps;
            const bossS = bossHp / r.dps;
            if (zone === 1) marks.push(`m${map}: ${trashS.toFixed(1)}s/foe ${Math.round(bossS)}s/boss`);
            if (trashS > TRASH_WALL || bossS > BOSS_WALL) {
                wall = { map, zone, trashS, bossS, why: trashS > TRASH_WALL ? "wanderers" : "the boss" };
                break;
            }
        }
    }
    console.log(`\n── ${label}`);
    console.log(`   ${Math.round(r.dps).toLocaleString()} dps · ${Math.round(f.health).toLocaleString()} hp · ${Math.round(r.ehp).toLocaleString()} effective`);
    console.log(`   ${marks.slice(0, 7).join("  |  ")}`);
    console.log(wall
        ? `   WALL at map ${wall.map} zone ${wall.zone} — ${wall.trashS.toFixed(0)}s per wanderer, ${Math.round(wall.bossS)}s on the boss (${wall.why})`
        : `   clears all ${MAPS_BUILT} built maps`);
    return { label, dps: r.dps, wall };
}

const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const who = names.length ? names : ["Shroeder", "Eric D", "Littlewolf"];
for (const name of who) {
    const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = $1 OR alias = $1`, [name]);
    if (!row) { console.log(`\n── ${name}: no such member`); continue; }
    await reach(name, row.id);
}

// ── THE FRESH ACCOUNT ────────────────────────────────────────────────────────────────────────────────────────
// Not a hypothetical: the real member with the lowest XP who has actually got a fighter profile. That is as
// close to "day one" as production can show, and it is the player the town plan puts in zone 1.
const newbie = await db.queryOne(
    `SELECT id, display_name, xp FROM mkt_buyer WHERE xp < 300 AND alias IS NOT NULL ORDER BY xp ASC LIMIT 1`);
if (newbie) await reach(`${newbie.display_name} (lowest XP on the server — ${newbie.xp} xp, stands in for day one)`, newbie.id);
console.log(`\n(wall = one wanderer over ${TRASH_WALL}s, or a boss over ${BOSS_WALL}s, at ${MAPS_BUILT} built maps)`);
