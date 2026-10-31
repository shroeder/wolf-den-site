import "server-only";

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { GROVE_ENEMIES, GROVE_ZONES } from "@/lib/marketplace/grove-catalog.js";
import { groveOpen } from "@/lib/marketplace/owner.js";
import { TOWNS } from "@/lib/marketplace/towns.js";

// ── THE HUNTS ────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "every town has its own kind of thematic quest giver who wants you to go out and slay monsters that
// are in the different zones. And then maybe there's like a quest tracker."
//
// A town's quest giver asks for kills in THAT town's map. Fenhollow's bog-reader wants Fen Lurkers drowned;
// Ashfall's warden wants whatever walks the Ashen Reach put down. The town stops being a menu with a street
// painted behind it and becomes the place that sends you somewhere.
//
// ── ⚠️ THIS IS THE THIRD QUEST FAMILY AND THEY MUST NOT BE MERGED ────────────────────────────────────────────
// The Den now has three, and they answer different questions:
//
//   town-quests.js   the Quartermaster's dailies — rewards playing in the PLAZA (raids, the tavern, the Well)
//   acts.js          the act ladder — a one-way, non-repeatable ramp about the SYSTEMS each town unlocks
//   this file        hunts — repeatable, rewards LEAVING the plaza for the map this town opens onto
//
// Folding hunts into the Quartermaster's pool was the obvious move and it is wrong: that pool rotates five
// activities a day across the whole game, so a member standing in Rootwood would be offered a hunt for a
// creature that lives six maps away. A hunt is only coherent next to the door it sends you through.
//
// ⚠️ IT SHARES THE QUARTERMASTER'S TABLE ON PURPOSE. `mkt_town_quest` is keyed (buyer_id, day, key) and the
// claim path is already written, tested and idempotent. A second progress table would be a second place for
// a claim to double-pay. The keys are namespaced `hunt:<foeId>` so the two families cannot collide.

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const HUNTS_PER_TOWN = 3;

// ── WHO IS ASKING ────────────────────────────────────────────────────────────────────────────────────────────
// A ROLE rather than a personal name, and deliberately: the art for each of these was drawn from the same
// description, so "The Bog-Reader" is a caption for a picture that exists. Inventing "Maela of Fenhollow" would
// be naming a character nobody drew and nobody wrote, and the name would be the only thing about her.
const GIVER = {
    rootwood: "The Ranger",
    deepdelve: "The Mine Captain",
    fenhollow: "The Bog-Reader",
    saltwrack: "The Harbourmaster",
    drownedquay: "The Ruin-Diver",
    gilded: "The Caravan-Master",
    ashfall: "The Ash-Warden",
};
export const giverFor = (townId) => GIVER[townId] || null;

// What they say when you walk up. One line each, in their own register — the Quartermaster's "do the town a
// service, wolf" was appearing under all seven names, which made seven characters sound like one person
// wearing different coats.
const GREETING = {
    rootwood: "Tracks everywhere this morning. Thin them out for me and I'll see you paid.",
    deepdelve: "Something's been at the props again. Go down there and put a stop to it.",
    fenhollow: "The water's been talking. It says there's too many of them — quiet it down.",
    saltwrack: "Can't land a boat with that lot on the shingle. Clear me a berth.",
    drownedquay: "They nest in the flooded halls. Go in, and come back up.",
    gilded: "Caravans won't cross while those things hold the road. Make it passable.",
    ashfall: "The wall holds because somebody keeps it held. Today that's you.",
};
export const greetingFor = (townId) => GREETING[townId] || null;

/** FNV-1a — the same stable hash the Quartermaster rotates on, so both families roll the same way. */
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const chicagoDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

// Enough plural to not look broken. Creature names are hand-authored and none of them is irregular, but a few
// end in a sibilant and "Ashglass Shrikess" would be the kind of small wrongness that reads as machine output.
function plural(name, n) {
    if (n === 1) return name;
    return /(s|x|z|ch|sh)$/i.test(name) ? `${name}es` : `${name}s`;
}

/**
 * How many of a thing is a fair ask at this depth, and what it pays.
 *
 * ⚠️ THE TARGET IS FLAT AND THE REWARD CLIMBS. The instinct is to ask for more of them deeper down, and it is
 * backwards: a map-7 creature already takes far longer to kill than a map-1 one, so a rising target multiplies
 * two curves together and the last town's hunt becomes an afternoon. What changes with depth is the PAY.
 *
 * ⚠️ AND THE GOLD IS IN THE QUARTERMASTER'S BAND, DELIBERATELY. His dailies pay 30-150. A hunt that paid five
 * times that would make every other daily in the game look like a waste of a slot — and gold minting is one
 * lever, pulled in one place, measured by daily total. See [[gold-mint-rate-lever]].
 */
function shapeFor(mapN, roll) {
    const target = [8, 10, 12][roll % 3];
    const gold = Math.round((45 + (mapN - 1) * 18) / 5) * 5;
    return { target, gold };
}

/** Every creature that actually lives in this town's map, deduplicated, in zone order. */
function foesOfMap(mapN) {
    const seen = new Set();
    const out = [];
    for (const z of GROVE_ZONES.filter((x) => (x.map || 1) === mapN).sort((a, b) => a.n - b.n)) {
        for (const id of z.enemies || []) {
            if (seen.has(id)) continue;
            const foe = GROVE_ENEMIES[id];
            if (!foe) continue;
            seen.add(id);
            out.push({ id, name: foe.name });
        }
    }
    return out;
}

/**
 * Today's hunts for one town. Deterministic from the date, so every member sees the same board and it is
 * stable for the whole Chicago day — the same contract the Quartermaster's rotation gives.
 */
export function huntsForTown(townN, day = chicagoDay()) {
    const town = TOWNS.find((t) => t.n === Number(townN));
    if (!town) return [];
    // ⚠️ TOWN N OPENS ONTO MAP N. That is the whole premise of the gating design and the reason a hunt can be
    // written at all — see the table at the top of towns.js.
    const foes = foesOfMap(town.n);
    if (!foes.length) return [];

    const ordered = foes
        .map((f) => ({ f, r: hashStr(`${day}:${town.id}:${f.id}`) }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.f);

    return ordered.slice(0, Math.min(HUNTS_PER_TOWN, ordered.length)).map((f) => {
        const { target, gold } = shapeFor(town.n, hashStr(`${day}:t:${f.id}`));
        return {
            key: `hunt:${f.id}`,
            foeId: f.id,
            name: f.name,
            town: town.n,
            townName: town.name,
            mapName: town.opens,
            target,
            gold,
            // ⚠️ THE CREATURE'S OWN PORTRAIT, WHICH ALREADY EXISTS. Every foe in the catalogue carries `art`
            // for the Grove scene; a hunt row showing the thing you are being sent after costs nothing and
            // is the difference between a quest and a line of text. The first cut drew a plain gold pip.
            art: GROVE_ENEMIES[f.id]?.art || null,
            giver: GIVER[town.id] || null,
            greeting: GREETING[town.id] || null,
            // The giver's own words. One line, naming the creature and the place, because a quest that reads
            // "kill 10 rootrat" is a database row with a verb in front of it.
            line: `${town.name} wants ${target} ${plural(f.name, target)} put down in ${town.opens}.`,
        };
    });
}

/**
 * Tick progress for whatever just died.
 *
 * ⚠️ IT TAKES THE WHOLE TALLY, NOT ONE CREATURE AT A TIME. settleKills hands back {foeId: n} for a batch of up
 * to ninety seconds of play; calling this per creature would be one round trip per species per settle, on the
 * single hottest write path in the feature. One statement, however many species died.
 *
 * ⚠️ AND IT ONLY TICKS WHAT IS ACTUALLY ON TODAY'S BOARD. A member who kills a thing nobody asked for gets
 * nothing, which is correct — but it also means this cannot be used to retro-credit a hunt, because the row
 * only exists once the hunt does.
 */
export async function bumpHunts(buyerId, slain, mapN) {
    if (!buyerId || !slain || !mapN) return;
    // ⚠️ THE MAP THE KILLS HAPPENED IN, NOT THE TOWN THE MEMBER LAST VISITED. Town N opens onto map N, so the
    // two numbers are the same — but the MEANING is not. Keying off the visited town would credit Fenhollow's
    // hunt for creatures killed in the Ashen Reach, because the town you walked through is not where you are.
    const today = huntsForTown(mapN);
    if (!today.length) return;
    const byFoe = Object.fromEntries(today.map((h) => [h.foeId, h]));

    const rows = [];
    for (const [foeId, n] of Object.entries(slain)) {
        const h = byFoe[foeId];
        if (!h || !(n > 0)) continue;
        rows.push({ key: h.key, n: Math.min(n, h.target), target: h.target });
    }
    if (!rows.length) return;

    // One statement per hunt, but at most three, and only for species somebody is actually hunting.
    for (const r of rows) {
        await db.query(
            `INSERT INTO mkt_town_quest (buyer_id, day, key, progress) VALUES ($1, ${DAY}, $2, LEAST($3::int, $4::int))
             ON CONFLICT (buyer_id, day, key)
             DO UPDATE SET progress = LEAST(mkt_town_quest.progress + $3::int, $4::int)`,
            [buyerId, r.key, r.n, r.target],
        ).catch(() => {});
    }
}

/** Today's board for a town, with this member's progress on it. */
export async function getHunts(buyerId, townN) {
    // ── ⚠️ A HUNT IS A GROVE QUEST WEARING A TOWN'S CLOTHES ─────────────────────────────
    // Luke: "the grove quests are leaking into the base town."
    //
    // Every hunt names a creature out of GROVE_ENEMIES and sends you into the map that town opens onto, and
    // the ONLY thing that moves one is bumpHunts, called from the Grove's own settle. So to a member the
    // Grove is not open for, this board was a quest giver handing out work that is impossible to start and
    // impossible to progress, in a place they have never been told exists.
    //
    // The town page already gated the Grove's DOOR on exactly this. The quest giver standing next to it was
    // not gated at all — [[feature-gates-come-in-pairs]], almost word for word.
    //
    // ⚠️ GATED IN THE LIB, NOT IN THE ROUTE. getHunts has two callers in the route (the GET and the
    // POST's reply) and claimHunt is a third door; a check in one of them is a check in one of them.
    if (!groveOpen(buyerId)) return [];
    const today = huntsForTown(townN);
    if (!today.length) return [];
    if (!buyerId) return today.map((h) => ({ ...h, progress: 0, claimed: false, claimable: false }));

    const rows = await db.query(
        `SELECT key, progress, claimed FROM mkt_town_quest WHERE buyer_id = $1 AND day = ${DAY} AND key LIKE 'hunt:%'`,
        [buyerId],
    ).catch(() => []);
    const by = Object.fromEntries((rows || []).map((r) => [r.key, r]));

    return today.map((h) => {
        const row = by[h.key];
        const progress = Math.min(Number(row?.progress) || 0, h.target);
        const claimed = Boolean(row?.claimed);
        return { ...h, progress, claimed, claimable: !claimed && progress >= h.target };
    });
}

/**
 * Claim a finished hunt.
 *
 * ⚠️ THE UPDATE IS THE LOCK, exactly as the act board does it. `claimed = FALSE` in the WHERE and RETURNING
 * means two taps in the same second produce one payout — the second one updates nothing, gets nothing back,
 * and stops here. Checking first and then paying is the shape that double-pays.
 */
export async function claimHunt(buyerId, key, townN) {
    if (!buyerId || !key) return { ok: false, error: "unknown_hunt" };
    // The second door. A board that renders nothing still has a POST behind it, and a row could have been
    // banked before the gate existed — see the note in getHunts.
    if (!groveOpen(buyerId)) return { ok: false, error: "unknown_hunt" };
    const hunt = huntsForTown(townN).find((h) => h.key === key);
    if (!hunt) return { ok: false, error: "not_today" };

    const done = await db.queryOne(
        `UPDATE mkt_town_quest SET claimed = TRUE
          WHERE buyer_id = $1 AND day = ${DAY} AND key = $2 AND claimed = FALSE AND progress >= $3
          RETURNING key`,
        [buyerId, key, hunt.target],
    ).catch(() => null);
    if (!done) return { ok: false, error: "not_done" };

    // ⚠️ logCoin ONLY WRITES THE LEDGER LINE — it does not move the balance. The gold is credited by its own
    // UPDATE, exactly as claimTownQuest does it, and the ledger line carries the resulting balance so the
    // coin history reconciles. Paying with logCoin alone would award a member nothing while telling the books
    // it had, which is the worst of both.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
        [buyerId, hunt.gold],
    ).catch(() => null);
    await logCoin(buyerId, hunt.gold, "town_hunt", {
        balanceAfter: paid?.gold, meta: { key, town: townN, foe: hunt.foeId },
    }).catch(() => {});
    await trackActivity(buyerId, "town_hunt", { key, foe: hunt.foeId, town: townN, gold: hunt.gold }).catch(() => {});
    return { ok: true, gold: Number(paid?.gold || 0), reward: hunt.gold, name: hunt.name };
}

/** How many hunts are sitting finished and unclaimed — the badge on the giver. */
export async function huntsClaimable(buyerId, townN) {
    const list = await getHunts(buyerId, townN);
    return list.filter((h) => h.claimable).length;
}
