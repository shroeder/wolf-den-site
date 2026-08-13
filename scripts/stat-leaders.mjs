// ── TOP TEN BY EVERY STAT, WITH EVERYTHING COUNTED ───────────────────────────────────────────────────────────
// Runs the GAME'S OWN stat pipeline rather than a copy of it, via the alias loader in scripts/lib. A member's
// numbers come from six places — base items, set bonuses, the compendium, forge enhancement, socketed gems,
// then pet and badges on top — and a reporting script that reimplemented that would be a seventh copy, wrong
// the first time any of the six moved.
//
// Usage:  node --import ./scripts/lib/register-loader.mjs scripts/stat-leaders.mjs [--top 10] [--stat might]
import { readFileSync } from "node:fs";

process.env.DATABASE_URL ||= readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();

// The db module logs every query as JSON; useful in prod, unreadable in a report.
const realLog = console.log;
console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith('{"timestamp"')) return; realLog(...a); };

const arg = (flag, dflt) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? process.argv[i + 1] : dflt;
};
const TOP = Number(arg("--top", 10));
const ONLY = arg("--stat", null);

const { db } = await import("@/lib/db");
const { getEquippedStatsForMembers, getEquippedIdsForMembers } = await import("@/lib/marketplace/inventory.js");
const { getBadgePassivesForMembers } = await import("@/lib/marketplace/badges.js");
const { getPetCombatBonus } = await import("@/lib/marketplace/pet-combat.js");
const { beastbondMult } = await import("@/lib/marketplace/signatures.js");

const members = await db.query(
    `SELECT id, COALESCE(NULLIF(display_name,''), alias, 'member') AS who FROM mkt_buyer WHERE COALESCE(xp,0) > 0`
);
const ids = members.map((m) => m.id);

const [gear, badges, equipped] = await Promise.all([
    getEquippedStatsForMembers(ids),
    getBadgePassivesForMembers(ids),
    getEquippedIdsForMembers(ids),
]);

// Pets are the one source with no bulk form, so they are fetched per member.
const pets = new Map();
for (const m of members) pets.set(m.id, (await getPetCombatBonus(m.id).catch(() => null))?.stats || {});

const rows = members.map((m) => {
    const g = gear.get(m.id) || {};
    const bs = badges.get(m.id) || {};
    const ps = pets.get(m.id) || {};
    const bb = beastbondMult(equipped.get(m.id) || {});
    // Every key any of the three sources produced — so a stat added later shows up without editing this file.
    const out = { who: m.who };
    for (const k of new Set([...Object.keys(g), ...Object.keys(bs), ...Object.keys(ps)])) {
        if (typeof (g[k] ?? bs[k] ?? ps[k]) !== "number") continue;
        out[k] = (g[k] || 0) + (ps[k] || 0) * bb + (bs[k] || 0);
    }
    // Pet FEROCITY feeds Might, exactly as combatStats() in arena.js does it.
    out.might = (out.might || 0) + (ps.ferocity || 0) * bb;
    return out;
});

const LABELS = {
    might: "Might", ferocity: "Ferocity", fortune: "Fortune",
    crit_chance: "Crit chance", crit_power: "Crit power", extra_strike: "Extra strikes/day",
    plunder: "Plunder (sailing)", dredge: "Dredge (sailing)", bulwark: "Bulwark (sailing)",
    tailwind: "Tailwind (sailing)", farm_xp: "Farm XP", pet_xp: "Pet XP", raid_damage: "Raid damage",
};
// The crit stats are percentage POINTS, not the number the ring uses — they go through a base and a cap.
// Show what the arena actually grants, computed by the arena's own helpers so it cannot drift.
const { critChanceFrom, critMultFrom, CRIT_CAP } = await import("@/lib/marketplace/arena-kit.js");
const EFFECTIVE = {
    crit_chance: (v) => {
        const eff = critChanceFrom(v);
        return `${v} pts  →  ${Math.round(eff * 100)}% in the ring${eff >= CRIT_CAP ? "  (CAPPED)" : ""}`;
    },
    crit_power: (v) => `${v} pts  →  x${Math.round(critMultFrom(v) * 100) / 100} on a crit`,
};
const fmt = (k, v) => {
    const r = Math.round(v * 10) / 10;
    return EFFECTIVE[k] ? EFFECTIVE[k](r) : String(r);
};

const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== "who");
// Core five first, then whatever else exists, so the important boards are at the top.
const ORDER = ["might", "ferocity", "crit_chance", "crit_power", "fortune", "extra_strike"];
keys.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

console.log(`\n${members.length} members with XP · all bonuses counted (gear + sets + compendium + forge + gems + pet + badges)\n`);
for (const k of keys) {
    if (ONLY && k !== ONLY) continue;
    const top = rows.filter((r) => (r[k] || 0) > 0).sort((a, b) => b[k] - a[k]).slice(0, TOP);
    const label = LABELS[k] || k;
    console.log(`── ${label} ${"─".repeat(Math.max(2, 44 - label.length))}`);
    if (!top.length) { console.log("   nobody has any\n"); continue; }
    const w = Math.max(...top.map((r) => r.who.length));
    top.forEach((r, i) => console.log(`   ${String(i + 1).padStart(2)}. ${r.who.padEnd(w)}   ${fmt(k, r[k])}`));
    console.log();
}
process.exit(0);
