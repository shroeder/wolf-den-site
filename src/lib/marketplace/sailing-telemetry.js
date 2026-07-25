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
    const daysSince = (isoStr) => (isoStr ? (now - new Date(isoStr).getTime()) / 86400000 : Infinity);
    const users = (rows || []).map((s) => {
        const level = boatLevel(s.speed_level, s.find_level, s.rarity_level, s.luck_level, s.raid_level);
        const loss = lossByAttacker.get(s.buyer_id);
        const extraTools = s.dig_tool_levels && typeof s.dig_tool_levels === "object" ? s.dig_tool_levels : {};
        const upgradesSum = num(s.speed_level) + num(s.find_level) + num(s.rarity_level) + num(s.luck_level) + num(s.raid_level);
        const digSum = num(s.dig_stamina_level) + num(s.dig_pierce_level) + num(s.dig_strike_level) + num(s.dig_efficient_level) + num(s.dig_detonator_level);
        const lastActive = iso(s.updated_at);
        const idle = daysSince(lastActive);
        const sailing = s.returns_at ? new Date(s.returns_at).getTime() > now : false;
        // A single "status" so the roster reads at a glance: at sea / active / cooling off / dormant.
        const status = sailing ? "sailing" : idle < 2 ? "active" : idle < 7 ? "idle" : "dormant";
        return {
            id: s.buyer_id,
            name: s.display_name || s.alias || "Member",
            alias: s.alias || null,
            boatLevel: level,
            boatForm: boatTier(level),
            // Fortune lives in the legacy luck_level column; Luck (waves stat) in find_level — see sailing.js.
            upgrades: { speed: num(s.speed_level), fortune: num(s.luck_level), rarity: num(s.rarity_level), luck: num(s.find_level), raid: num(s.raid_level) },
            neverUpgraded: upgradesSum === 0,
            voyages: { completed: num(s.voyages_completed), quality: s.voyage_quality || null, sailing, returnsAt: iso(s.returns_at) },
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
            lastActive,
            daysIdle: Number.isFinite(idle) ? Math.floor(idle) : null,
            status,
        };
    });

    const sum = (fn) => users.reduce((a, u) => a + fn(u), 0);
    const sailorsN = users.length;
    const membersN = num(memberRow?.n);
    const summary = {
        totalMembers: membersN,
        sailors: sailorsN,
        ignored: Math.max(0, membersN - sailorsN),
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

    // ── Derived INSIGHT (rates, funnel, retention, adoption gaps, leaderboards, action lists) ──────────────
    const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
    const round1 = (n) => Math.round(n * 10) / 10;
    const raided = users.filter((u) => u.raids.done > 0).length;
    const dug = sailorsN - summary.neverDug;
    const upgraded = sailorsN - summary.neverUpgraded;
    const metMerchant = users.filter((u) => u.merchant.encounters > 0).length;
    const forged = users.filter((u) => u.digging.chestsForged > 0).length;
    const repeat = users.filter((u) => u.voyages.completed >= 2).length;
    const oneAndDone = users.filter((u) => u.voyages.completed === 1).length;
    const top = (val, n = 5) => [...users].filter((u) => val(u) > 0).sort((a, b) => val(b) - val(a)).slice(0, n).map((u) => ({ name: u.name, value: val(u) }));

    const insights = {
        funnel: [
            { label: "Members", value: membersN, pct: 100 },
            { label: "Tried sailing", value: sailorsN, pct: pct(sailorsN, membersN) },
            { label: "Sailed 2+ times", value: repeat, pct: pct(repeat, membersN) },
            { label: "At sea now", value: summary.currentlySailing, pct: pct(summary.currentlySailing, membersN) },
        ],
        kpis: {
            adoptionPct: pct(sailorsN, membersN),
            repeatPct: pct(repeat, sailorsN),
            raidWinRate: pct(summary.totals.raidsWon, summary.totals.raidsWon + summary.totals.raidsLost),
            avgVoyages: sailorsN ? round1(summary.totals.voyages / sailorsN) : 0,
            avgBoatLevel: sailorsN ? round1(sum((u) => u.boatLevel) / sailorsN) : 0,
        },
        // Feature adoption among sailors — surfaces which sea systems are underused.
        adoption: [
            { label: "Raided a ship", n: raided, pct: pct(raided, sailorsN) },
            { label: "Dug an island", n: dug, pct: pct(dug, sailorsN) },
            { label: "Upgraded a boat", n: upgraded, pct: pct(upgraded, sailorsN) },
            { label: "Met the merchant", n: metMerchant, pct: pct(metMerchant, sailorsN) },
            { label: "Forged a chest", n: forged, pct: pct(forged, sailorsN) },
        ],
        retention: { repeat, repeatPct: pct(repeat, sailorsN), oneAndDone, oneAndDonePct: pct(oneAndDone, sailorsN) },
        activity: {
            activeToday: users.filter((u) => (u.daysIdle ?? 99) < 1).length,
            active7d: users.filter((u) => (u.daysIdle ?? 99) < 7).length,
            atSea: summary.currentlySailing,
            dormant: users.filter((u) => (u.daysIdle ?? 99) >= 7).length,
        },
        economy: {
            chestsForged: summary.totals.chestsForged,
            fragments: summary.totals.fragments,
            windRecharges: summary.totals.windRecharges,
            raidResets: summary.totals.raidResets,
            merchantDeals: summary.totals.merchantEncounters,
        },
        leaderboards: {
            voyages: top((u) => u.voyages.completed),
            boatLevel: top((u) => u.boatLevel),
            raidsWon: top((u) => u.raids.won),
            chests: top((u) => u.digging.chestsForged),
            fragments: top((u) => u.digging.fragments),
        },
        // Actionable segments (who to nudge). Names only, capped.
        action: {
            dormant: users.filter((u) => u.status === "dormant").sort((a, b) => (b.daysIdle || 0) - (a.daysIdle || 0)).slice(0, 12).map((u) => ({ name: u.name, days: u.daysIdle })),
            oneAndDone: users.filter((u) => u.voyages.completed === 1).slice(0, 12).map((u) => u.name),
            neverDug: users.filter((u) => u.digging.neverDug).slice(0, 12).map((u) => u.name),
            neverUpgraded: users.filter((u) => u.neverUpgraded).slice(0, 12).map((u) => u.name),
        },
    };

    return { summary, insights, users };
}
