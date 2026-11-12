import "server-only";

// ── WHAT COMES OUT OF A COLISEUM CHEST ───────────────────────────────────────────────────────────────────────
// Luke: "the actual loot that pops out of these chests is different. It's not actually the loot table that the
// chests use. It's going to spawn like a bunch of parts, definitely some gear, and depending on like the
// rarity of the chest... I'll let you decide what's fair."
//
// ⚠️ SAME SPRITE, SAME TIER NAMES, DIFFERENT TABLE. The tier here is a LOOK and a weight; it does not reach
// into the Grove chests' own contents, back when those existed. Pointing a new payout at an existing row
// quietly decays for everything else that reads it.
//
// ⚠️ AND PARTS COME FROM THE MAP THE RUN WAS ON. A heartwrought chest from the Ashen Reach paying Rootwood
// moss would be a reward that tells you nothing about where you earned it — and worse, a way to farm map
// one's crafting inputs from map seven.

import { db } from "@/lib/db";
// ⚠️ GROVE_GEAR, NOT GROVE_PARTS. The chest paid part stacks until 2026-11-08; it pays gear now, out of
// the same per-(zone, creature) tables an ordinary kill rolls against, so a chest cannot hand over a
// piece the forest itself would never drop.
import { GROVE_ZONES } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_GEAR } from "@/lib/marketplace/grove-loot.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { itemById } from "@/lib/marketplace/items.js";

/**
 * What one tier is worth.
 *
 * `parts` is how many separate part stacks fall out, `each` how deep a stack is, and `gear` the chance of a
 * gear piece riding along. Luke asked for "definitely some gear" — so the top two tiers are a certainty and
 * the bottom two are a real chance rather than a tease.
 */
const TIER = {
    // ── ⚠️ `pieces` REPLACED `parts`/`each`/`gear`, AND THE LADDER IS DERIVED FROM THEM ────────────
    // The old shape was { parts: n, each: [lo, hi], gear: chance } — n part stacks of that depth, plus a
    // chance of gear riding along. Luke: "a bunch of parts, definitely some gear", which is why the top
    // two tiers had gear: 1.
    //
    // ⚠️ THE `gear` CHANCE IS NOT CARRIED OVER AS A CHANCE, DELIBERATELY. With parts gone it was the only
    // thing in the box, and mossbound at 0.35 would have opened to NOTHING on two chests in three — a
    // chest that opens empty is not a reward, it is a bug the player reports. Every tier pays at least one
    // piece now and the tier decides HOW MANY, which is the same ladder the old numbers described (0.35 →
    // 0.6 → 1 → 1 climbed, and so does this).
    mossbound:   { pieces: 1 },
    barrowed:    { pieces: 1 },
    warrenspun:  { pieces: 2 },
    heartwrought:{ pieces: 3 },
};

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
/**
 * Every piece of gear the creatures of this map can drop, deduplicated.
 *
 * ⚠️ BUILT FROM GROVE_GEAR RATHER THAN AUTHORED. The tables are keyed `zone|creature` and each row holds
 * a normal, a rare and a super-rare piece, so the map's whole pool is already written down — and taking
 * it from there means a chest can never hand over something the forest itself would not drop, which is
 * the invariant a second authored list would eventually break.
 *
 * ⚠️ AND IT TAKES THE SUPER-RARE SLOT, which is the one thing that makes the chest worth the key. An
 * arena run is a key, two minutes and twelve waves; paying it the same `normal` piece a single rootrat
 * coughs up would make the whole building pointless. The slot split that governs a KILL (SLOT_SPLIT in
 * grove-roll.js) deliberately does not apply here: this is the reward for clearing the room, not a roll.
 */
function gearOfMap(mapN) {
    const zoneIds = new Set(GROVE_ZONES
        .filter((z) => Number(z.map || Math.ceil(z.n / 12)) === Number(mapN))
        .map((z) => z.id));
    const out = new Set();
    for (const [key, row] of Object.entries(GROVE_GEAR)) {
        if (!zoneIds.has(String(key).split("|")[0])) continue;
        if (row?.sup) out.add(row.sup);
    }
    return [...out];
}

/**
 * Open one chest.
 *
 * ⚠️ THE ROW IS THE LOCK. Marking it opened is conditional on it not already being open, so two taps on the
 * same chest — which is exactly what a chest you tap in a platformer invites — cannot both pay.
 */
export async function openColiseumChest(buyerId, chestId) {
    if (!buyerId || !chestId) return { ok: false, error: "bad_request" };

    const row = await db.queryOne(
        `UPDATE mkt_grove_coliseum_chest SET opened_at = NOW()
          WHERE id = $1 AND buyer_id = $2 AND opened_at IS NULL
          RETURNING id, map_n, tier`,
        [chestId, buyerId],
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_open" };

// ⚠️ THE COLISEUM'S OWN TIER LADDER, NOT THE GROVE'S. These four names used to come from
// COLISEUM_TIERS in grove-forge.js, which went when the Grove's chests were removed. The Coliseum's
// chests are a DIFFERENT system -- their own table (mkt_grove_coliseum_chest), their own roll, their own
// opening screen -- and they are the whole of what an arena run pays, so removing them would leave the
// Coliseum rewarding nothing. Luke asked for the Grove's chests and merits to go; this was not that.
//
// Borrowing the names was always the loose part: a shared constant implied a shared system and there was
// none. Declared here, where the only thing that reads it lives.
const COLISEUM_TIERS = ["mossbound", "barrowed", "warrenspun", "heartwrought"];

    const tier = TIER[row.tier] || TIER[COLISEUM_TIERS[0]];
    const pool = gearOfMap(row.map_n);
    // A map with no gear table is a map whose zones are not built. Nothing to hand over, and saying so
    // is better than throwing — the row is already spent, so the player must still get an answer.
    if (!pool.length) return { ok: true, tier: row.tier, map: Number(row.map_n), gear: [] };

    // Seeded off the chest's own id so re-reading a result cannot re-roll it. The row is already spent by
    // the update above; this only decides what was in it.
    let seed = Number(row.id) * 2654435761 % 2147483647;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // ── ⚠️ THE GEAR IS GRANTED NOW. IT NEVER WAS. ───────────────────────────────────────────────────
    // The old line was `gear: rng() < tier.gear ? { tier: row.tier } : null` — a MARKER, with no
    // grantItem behind it anywhere. So "definitely some gear" on the top two tiers handed over exactly
    // nothing for the whole life of the Coliseum, and nobody noticed because the part stacks beside it
    // were real. [[declared-but-never-read]]. Parts coming out is what exposed it: with them gone the
    // chest paid literally nothing at all.
    //
    // ⚠️ THROUGH grantItem, THE FUNCTION EVERY OTHER SOURCE USES, with `via` naming this faucet so the
    // ledger can tell an arena piece from a wanderer drop. A second INSERT beside it would be a second
    // path for one payout, which this repo has paid for twice. [[atomic-split-into-steps-drops-lines]].
    const gear = [];
    for (let i = 0; i < tier.pieces; i += 1) {
        const id = pick(pool, rng);
        const ok = await grantItem(buyerId, id, "grove_coliseum").catch(() => null);
        if (ok === null) continue;
        // ⚠️ THE NAME AND RARITY COME FROM THE CATALOGUE, NOT FROM HERE. Same rule as the settle: the
        // roll knows an id, and a card reading "grove_sup" is a card nobody can read.
        const it = itemById(id);
        gear.push({ id, name: it?.name || id, rarity: it?.rarity || null, slot: it?.slot || null, icon: it?.icon || null });
    }

    return {
        ok: true,
        tier: row.tier,
        map: Number(row.map_n),
        // ── ⚠️ AND IT IS ON A SCREEN NOW, 2026-11-12 ────────────────────────────────────────────
        // For the whole life of the Coliseum this array went into useColiseum's `result` and nothing
        // read `col.result` anywhere in GroveClient — zero call sites. A member opened a chest and was
        // told nothing at all about what was in it, which is the same [[declared-but-never-read]] as
        // the dead gear marker above, one layer up, and the reason that bug survived so long.
        //
        // The hook reports through an `onResult` callback now and the Grove feeds this straight into
        // the kill bar's own chest sequence: the tier's painted sprite rattles, loses the fight, and
        // opens onto these pieces drawn with ItemArt. So the shape below is READ, and changing it is a
        // change to something visible — which is the state it should have been in all along.
        //
        // ⚠️ `gear: []` IS A REAL CASE AND THE SCREEN HANDLES IT. An unbuilt map has no gear table and
        // the row above is already spent by the time we know, so the card says "Nothing but dust"
        // rather than opening onto a blank.
        gear,
    };
}
