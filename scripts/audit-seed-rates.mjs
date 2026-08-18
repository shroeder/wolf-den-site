// ── HOW MANY SEEDS DOES THE DEN ACTUALLY GET, AND OF WHAT? ───────────────────────────────────────────────────
// Seeds were nearly unobtainable because nine of ten declared sources had no caller. Now every source is
// wired, which is exactly the moment to ask the opposite question — did we overshoot, especially in the mid
// and high tiers that were the whole point?
//
// It multiplies REAL seven-day volumes out of mkt_activity_event by each source's own odds and band, rather
// than guessing. Odds are read from the source files where that is possible and named here where it is not,
// so a number that drifts shows up as a mismatch rather than a quiet lie — the failure the recipe audit had.
//
// Run:  node scripts/audit-seed-rates.mjs [--days 7]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/)[1]);
const i = process.argv.indexOf("--days");
const DAYS = Math.max(1, Number(i > -1 ? process.argv[i + 1] : 7) || 7);

const crops = readFileSync("src/lib/marketplace/farm-crops.js", "utf8");
const bandBlock = crops.match(/SEED_BANDS = \{([\s\S]*?)\n\};/)[1];
const trickleBlock = crops.match(/SEED_TRICKLE = \{([\s\S]*?)\n\};/)[1];

// { source: { rarity: weight } }
function parseBands(block) {
    const out = {};
    for (const m of block.matchAll(/^\s{4}([a-z_]+):\s*\{([^}]*)\}/gm)) {
        const w = {};
        for (const k of m[2].matchAll(/(common|rare|epic|legendary|mythic):\s*([0-9.]+)/g)) w[k[1]] = Number(k[2]);
        if (Object.keys(w).length) out[m[1]] = w;
    }
    return out;
}
const BANDS = parseBands(bandBlock);
// The trickle nests its band one level deeper.
const TRICKLE = {};
for (const m of trickleBlock.matchAll(/^\s{4}([a-z_]+):\s*\{\s*chance:\s*([0-9.]+),\s*band:\s*\{([^}]*)\}/gm)) {
    const w = {};
    for (const k of m[3].matchAll(/(common|rare|epic|legendary|mythic):\s*([0-9.]+)/g)) w[k[1]] = Number(k[2]);
    TRICKLE[m[1]] = { chance: Number(m[2]), band: w };
}

// ── WHAT EACH SOURCE COSTS TO REACH ──────────────────────────────────────────────────────────────────────────
// event: the activity row that means "this happened once". per: expected seeds per event, i.e. the source's
// own odds times how many it hands over. Named here because they live inside reward tables and chains that
// cannot be read reliably as text — each is annotated with where it comes from so a drift is findable.
const SOURCES = [
    // The wheel: one wedge of 134 weight, paying 3. Mini: reached on the mini_wheel wedge (6/134), then 11 of 88.
    { key: "spin", band: "spin", event: "daily_spin", per: (8 / 134) * 3, note: "wedge 8 of 134 x3" },
    { key: "spin_mini", band: "spin_mini", event: "daily_spin", per: (6 / 134) * (11 / 88) * 3, note: "mini wedge 11 of 88, reached 6 of 134, x3" },
    // Fishing: the haul table's seed row. Rate lives in the haul weights; measured share used here.
    { key: "fishing", band: "fishing", event: "fish_caught", per: 0.10, note: "haul table seed row ~10%" },
    { key: "ship_battle", band: "ship_battle", event: "sail_raid", per: 0.25, note: "battle reward.seed ~25%" },
    { key: "seam", band: "seam", event: "mine_descend", per: (4 / 110) * 1, note: "card w4 of ~110 shallow" },
    { key: "seam_deep", band: "seam_deep", event: "mine_descend", per: (7 / 110) * 1, note: "card w~7 of ~110 deep" },
    { key: "sail_dig", band: "sail_dig", event: "sail_dig", per: 0.22 * 2, note: "22% x2" },
    { key: "sail_dig_deep", band: "sail_dig_deep", event: "sail_dig", per: 0.30 * 3 * 0.35, note: "30% x3 on deep boards (~35% of digs)" },
    { key: "chest_wooden", band: "chest_wooden", event: "open_chest", per: 0.10 * 2 * 0.5, note: "10% x2, wooden ~50% of opens" },
    { key: "chest_iron", band: "chest_iron", event: "open_chest", per: 0.13 * 2 * 0.3, note: "13% x2, iron ~30%" },
    { key: "chest_gold", band: "chest_gold", event: "open_chest", per: 0.16 * 3 * 0.15, note: "16% x3, gold ~15%" },
    { key: "boss_kill", band: "boss_kill", event: "boss_kill", per: 0.16 * 3, note: "16% x3" },
    { key: "arena_win", band: "arena_win", event: "arena_crate", per: (8 / 100) * 3, note: "crate row w8 x3" },
];

const rows = await sql`
    SELECT event, COUNT(*)::int AS n FROM mkt_activity_event
     WHERE created_at > NOW() - (INTERVAL '1 day' * ${DAYS}) GROUP BY 1`;
const count = Object.fromEntries(rows.map((r) => [r.event, r.n]));
const [{ n: members }] = await sql`
    SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_activity_event
     WHERE created_at > NOW() - (INTERVAL '1 day' * ${DAYS})`;

const RARITIES = ["common", "rare", "epic", "legendary", "mythic"];
const total = Object.fromEntries(RARITIES.map((r) => [r, 0]));
const table = [];
const split = (band, n) => {
    const w = BANDS[band] || {};
    const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(RARITIES.map((r) => [r, ((w[r] || 0) / sum) * n]));
};

for (const s of SOURCES) {
    const events = count[s.event] || 0;
    const seeds = events * s.per;
    const by = split(s.band, seeds);
    for (const r of RARITIES) total[r] += by[r];
    table.push({
        source: s.key, events, "seeds/wk": +((seeds / DAYS) * 7).toFixed(1),
        mid: +(((by.rare + by.epic) / DAYS) * 7).toFixed(1),
        high: +(((by.legendary + by.mythic) / DAYS) * 7).toFixed(2),
        basis: s.note,
    });
}
// The trickle, off its own events.
// ── ONE SOURCE THIS CANNOT MODEL, AND SAYING SO IS THE POINT ─────────────────────────────────────────────────
// `pet_companion` carries chance 1 because the PERK decides whether it fires — `petFarm.seed > 0 && random <
// petFarm.seed/100`, which needs a companion carrying the seed perk and then rolls its own percentage. Reading
// that as "every harvest" put 2,357 seeds a week on the board and swamped the whole table, which is the kind of
// number that gets quoted later. It is excluded and named rather than guessed at.
const TRICKLE_EVENT = { harvest_crop: "harvest_crop", pet_farm: "pet_farm", green_thumb: "farm_rated" };
const UNMODELLED = ["pet_companion"];
for (const [key, cfg] of Object.entries(TRICKLE)) {
    if (UNMODELLED.includes(key)) continue;
    const events = count[TRICKLE_EVENT[key]] || 0;
    const seeds = events * cfg.chance;
    const sum = Object.values(cfg.band).reduce((a, b) => a + b, 0) || 1;
    const by = Object.fromEntries(RARITIES.map((r) => [r, ((cfg.band[r] || 0) / sum) * seeds]));
    for (const r of RARITIES) total[r] += by[r];
    table.push({
        source: `${key} (trickle)`, events, "seeds/wk": +((seeds / DAYS) * 7).toFixed(1),
        mid: +(((by.rare + by.epic) / DAYS) * 7).toFixed(1),
        high: +(((by.legendary + by.mythic) / DAYS) * 7).toFixed(2),
        basis: `${Math.round(cfg.chance * 100)}% on the action`,
    });
}

table.sort((a, b) => b["seeds/wk"] - a["seeds/wk"]);
console.table(table);

const wk = (n) => (n / DAYS) * 7;
const all = RARITIES.reduce((a, r) => a + total[r], 0);
console.log(`\nAcross ${members} active members over ${DAYS} days:\n`);
console.table(RARITIES.map((r) => ({
    rarity: r, "seeds/wk": +wk(total[r]).toFixed(1),
    "per member/wk": +(wk(total[r]) / Math.max(1, members)).toFixed(2),
    share: `${((total[r] / Math.max(0.001, all)) * 100).toFixed(1)}%`,
})));
// ── WHAT A MEMBER SHOULD EXPECT IN A DAY ─────────────────────────────────────────────────────────────────────
// The weekly figure is the fleet average and it hides the shape: most of the supply comes from the loop you
// choose to run. So this reports per DAY, three ways — the average member, the median one, and a heavy one —
// by taking each person's own activity counts rather than dividing one total by a headcount.
const perMemberDaily = await sql`
    WITH ev AS (
        SELECT buyer_id, event, COUNT(*)::numeric AS n
          FROM mkt_activity_event
         WHERE created_at > NOW() - (INTERVAL '1 day' * ${DAYS})
         GROUP BY 1, 2
    )
    SELECT buyer_id, event, n FROM ev`;
const byMember = new Map();
for (const r of perMemberDaily) {
    if (!byMember.has(r.buyer_id)) byMember.set(r.buyer_id, {});
    byMember.get(r.buyer_id)[r.event] = Number(r.n);
}
const seedsFor = (counts) => {
    const out = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    for (const src of SOURCES) {
        const by = split(src.band, (counts[src.event] || 0) * src.per);
        for (const r of RARITIES) out[r] += by[r];
    }
    for (const [key, cfg] of Object.entries(TRICKLE)) {
        if (UNMODELLED.includes(key)) continue;
        const n = (counts[TRICKLE_EVENT[key]] || 0) * cfg.chance;
        const sum = Object.values(cfg.band).reduce((a, b) => a + b, 0) || 1;
        for (const r of RARITIES) out[r] += ((cfg.band[r] || 0) / sum) * n;
    }
    return out;
};
const perDay = [...byMember.values()].map((c) => {
    const s2 = seedsFor(c);
    const day = (n) => n / DAYS;
    return {
        low: day(s2.common),
        mid: day(s2.rare + s2.epic),
        high: day(s2.legendary + s2.mythic),
        all: day(RARITIES.reduce((a, r) => a + s2[r], 0)),
    };
}).sort((a, b) => a.all - b.all);
const at = (p) => perDay[Math.min(perDay.length - 1, Math.max(0, Math.floor(perDay.length * p)))] || { low: 0, mid: 0, high: 0, all: 0 };
const avg = (k) => perDay.reduce((a, x) => a + x[k], 0) / Math.max(1, perDay.length);
console.log(`
── SEEDS PER MEMBER PER DAY ──────────────────────────────────────────────`);
console.table([
    { who: "quiet (25th pct)", low: +at(0.25).low.toFixed(2), mid: +at(0.25).mid.toFixed(2), high: +at(0.25).high.toFixed(3), total: +at(0.25).all.toFixed(2) },
    { who: "typical (median)", low: +at(0.5).low.toFixed(2), mid: +at(0.5).mid.toFixed(2), high: +at(0.5).high.toFixed(3), total: +at(0.5).all.toFixed(2) },
    { who: "average", low: +avg("low").toFixed(2), mid: +avg("mid").toFixed(2), high: +avg("high").toFixed(3), total: +avg("all").toFixed(2) },
    { who: "keen (90th pct)", low: +at(0.9).low.toFixed(2), mid: +at(0.9).mid.toFixed(2), high: +at(0.9).high.toFixed(3), total: +at(0.9).all.toFixed(2) },
    { who: "heaviest", low: +at(0.999).low.toFixed(2), mid: +at(0.999).mid.toFixed(2), high: +at(0.999).high.toFixed(3), total: +at(0.999).all.toFixed(2) },
]);
const days = (n) => (n > 0 ? `one every ${(1 / n).toFixed(1)} days` : "never");
console.log(`A typical member: ${days(at(0.5).high)} at legendary-or-better. A keen one: ${days(at(0.9).high)}.`);

const mid = wk(total.rare + total.epic) / Math.max(1, members);
const high = wk(total.legendary + total.mythic) / Math.max(1, members);
console.log(`\nA member averages ${(wk(all) / Math.max(1, members)).toFixed(1)} seeds a week: ${mid.toFixed(1)} mid tier (rare+epic), ${high.toFixed(2)} high (legendary+mythic).`);
console.log(`
Not modelled: ${UNMODELLED.join(", ")} — gated by a companion perk, so the real rate depends on who is carrying one.`);
console.log(`A plot takes hours to grow, so the honest yardstick is plots-per-week, not seeds — a member with 4 plots can plant about ${(4 * 7).toFixed(0)} times a week at best.`);
