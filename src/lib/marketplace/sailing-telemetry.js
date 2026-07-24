import "server-only";

import { db } from "@/lib/db";
import { boatTier } from "@/lib/marketplace/sailing.js";

// Admin sailing telemetry: a cross-user summary + a per-user breakdown of everything a member has done at sea
// (voyages, raids, waves/tailwinds, encounters, merchant, digging, fragments, chests, upgrade levels, boat
// level/form, recharges), plus who they raided-and-lost-to. Read-only; powers the admin app's Sailing screen.

const num = (v) => Number(v) || 0;
const iso = (d) => (d ? new Date(d).toISOString() : null);
// Boat level = 1 + the five upgrade tracks summed (mirrors boatLevelFromUpgrades in sailing.js).
const boatLevel = (s, f, r, l, rd) => 1 + num(s) + num(f) + num(r) + num(l) + num(rd);

export async function getSailingTelemetry() {
    const [rows, raidLosses, raidWho, memberRow] = await Promise.all([
        db.query(`SELECT s.*, b.display_name, b.alias FROM mkt_sailing s JOIN mkt_buyer b ON b.id = s.buyer_id ORDER BY s.updated_at DESC NULLS LAST`).catch(() => []),
        // Raids each attacker did and LOST (recorded as a repelled defense against them) + the gold they dropped.
        db.query(`SELECT attacker_id, COUNT(*)::int AS losses, COALESCE(SUM(gold), 0)::int AS gold_lost FROM mkt_raid_defense GROUP BY attacker_id`).catch(() => []),
        // Who each attacker lost to (for the "who they fought" detail).
        db.query(`SELECT rd.attacker_id, COALESCE(NULLIF(b.display_name, ''), b.alias, 'Member') AS defender, COUNT(*)::int AS n
                    FROM mkt_raid_defense rd JOIN mkt_buyer b ON b.id = rd.defender_id
                   GROUP BY rd.attacker_id, defender ORDER BY n DESC`).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer`).catch(() => ({ n: 0 })),
    ]);

    const lossByAttacker = new Map((raidLosses || []).map((r) => [r.attacker_id, r]));
    const whoByAttacker = new Map();
    for (const r of raidWho || []) {
        if (!whoByAttacker.has(r.attacker_id)) whoByAttacker.set(r.attacker_id, []);
        const arr = whoByAttacker.get(r.attacker_id);
        if (arr.length < 4) arr.push({ name: r.defender, times: num(r.n) });
    }

    const now = Date.now();
    const users = (rows || []).map((s) => {
        const level = boatLevel(s.speed_level, s.find_level, s.rarity_level, s.luck_level, s.raid_level);
        const loss = lossByAttacker.get(s.buyer_id);
        const extraTools = s.dig_tool_levels && typeof s.dig_tool_levels === "object" ? s.dig_tool_levels : {};
        const upgradesSum = num(s.speed_level) + num(s.find_level) + num(s.rarity_level) + num(s.luck_level) + num(s.raid_level);
        const digSum = num(s.dig_stamina_level) + num(s.dig_pierce_level) + num(s.dig_strike_level) + num(s.dig_efficient_level) + num(s.dig_detonator_level);
        return {
            id: s.buyer_id,
            name: s.display_name || s.alias || "Member",
            alias: s.alias || null,
            boatLevel: level,
            boatForm: boatTier(level),
            upgrades: { speed: num(s.speed_level), fortune: num(s.find_level), rarity: num(s.rarity_level), luck: num(s.luck_level), raid: num(s.raid_level) },
            neverUpgraded: upgradesSum === 0,
            voyages: { completed: num(s.voyages_completed), quality: s.voyage_quality || null, sailing: s.returns_at ? new Date(s.returns_at).getTime() > now : false, returnsAt: iso(s.returns_at) },
            raids: { done: num(s.raid_count), won: num(s.raids_won), lost: num(loss?.losses), defended: num(s.raids_defended), resets: num(s.raid_resets), goldLost: num(loss?.gold_lost), lostTo: whoByAttacker.get(s.buyer_id) || [] },
            windRecharges: num(s.wind_recharges),
            waves: num(s.waves_total),
            encounters: { total: num(s.encounters_total), lastResult: s.encounter_result || null },
            merchant: { encounters: num(s.merchant_encounters), last: (s.merchant_json && typeof s.merchant_json === "object") ? s.merchant_json : null },
            digging: {
                fragments: num(s.fragments), chestsForged: num(s.chests_forged), chestPoints: num(s.chest_points),
                toolLevels: { stamina: num(s.dig_stamina_level), pierce: num(s.dig_pierce_level), strike: num(s.dig_strike_level), efficient: num(s.dig_efficient_level), detonator: num(s.dig_detonator_level), ...extraTools },
                neverDug: digSum === 0 && num(s.fragments) === 0 && num(s.chests_forged) === 0,
            },
            lastActive: iso(s.updated_at),
        };
    });

    const sum = (fn) => users.reduce((a, u) => a + fn(u), 0);
    const summary = {
        totalMembers: num(memberRow?.n),
        sailors: users.length,
        ignored: Math.max(0, num(memberRow?.n) - users.length),
        neverUpgraded: users.filter((u) => u.neverUpgraded).length,
        neverDug: users.filter((u) => u.digging.neverDug).length,
        currentlySailing: users.filter((u) => u.voyages.sailing).length,
        totals: {
            voyages: sum((u) => u.voyages.completed),
            raidsDone: sum((u) => u.raids.done),
            raidsWon: sum((u) => u.raids.won),
            raidsLost: sum((u) => u.raids.lost),
            raidsDefended: sum((u) => u.raids.defended),
            raidResets: sum((u) => u.raids.resets),
            windRecharges: sum((u) => u.windRecharges),
            waves: sum((u) => u.waves),
            encounters: sum((u) => u.encounters.total),
            merchantEncounters: sum((u) => u.merchant.encounters),
            fragments: sum((u) => u.digging.fragments),
            chestsForged: sum((u) => u.digging.chestsForged),
        },
    };
    return { summary, users };
}
