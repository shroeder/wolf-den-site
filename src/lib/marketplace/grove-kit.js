import "server-only";

import { db } from "@/lib/db.js";
import { combatStats, fighterFrom } from "@/lib/marketplace/arena.js";
import { treeEffects } from "@/lib/marketplace/arena-classes.js";
import { upgradeEffects } from "@/lib/marketplace/arena-upgrades.js";
import { GROVE_EMBLEMS, emblemStars } from "@/lib/marketplace/grove-catalog.js";
import { pieceById, setBonusFor, ARMOUR_SLOTS } from "@/lib/marketplace/grove-forge.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "grove-kit" });

// ── WHAT YOU BUILT, IN THE GROVE ─────────────────────────────────────────────────────────────────────────────
// Luke: "Every stat should be important that you have on your gear, as well as all the passives that you get,
// just like the arena. Attack speed should matter... crit chance, crit damage... anything that's a stat
// matters." And: "I do care about honoring all the players' commitments to their gear and their passives and
// their pets and everything. And I think we've already figured out how to do all that stuff with the arena."
//
// We have, so this calls it rather than restating it. The Grove's hero was a hardcoded `{ power: 12 }` plus
// emblems: a level-30 member in best-in-slot with a full badge set and an ascended pet hit for exactly the
// same 12 as an account made this morning. Every system the Den asks people to invest in — forge, sets,
// jewels, compendium, pets, badges, the casino tracks, the whole class tree — was worth nothing here.
//
// ⚠️ IT IS THE ARENA'S OWN TWO FUNCTIONS, NOT A COPY OF THEM. `combatStats` is the four-source merge (gear
// incl. forge/sets/jewels/compendium, pet x Beastbond, badges, casino perks) and `fighterFrom` is the
// conversion from raw stat points to combat values, with every diminishing-returns curve the ring uses. A
// second implementation would drift the first time either is touched, and "what does my gear do" is not a
// question this game should have two answers to. See [[reuse-the-rule-never-restate-it]],
// [[combat-stat-sources-four]], [[balance-constants-never-copied]].
//
// ⚠️ AND BADGES ARE THE BIG ONE. 131 badges carry a combat bonus, worth about +356 Might at a full set
// against +202 for a best-in-slot wardrobe. A system that reads gear and skips badges is not slightly off —
// it is ignoring the largest single source of a veteran's power.

/**
 * Add Grove-vocabulary stat points into the Arena's pool.
 *
 * ⚠️ ONE MAPPING, TWO CALLERS, AND IT WAS INLINE IN THE EMBLEM LOOP UNTIL THE BOSS SETS ARRIVED. The two
 * systems name the same stats differently -- the Grove says `crit_rate` and `armour`, the pool says
 * `crit_chance` and `armor` -- and a second copy of that translation is a second thing to forget when a
 * stat is added. A set piece granting `crit_rate` into a pool that reads `crit_chance` does not throw; it
 * is silently worth nothing. See [[reuse-the-rule-never-restate-it]].
 *
 * Two stats do not live in the pool at all and get their own channels: attack speed is a PERCENT here and
 * a rate there, so it rides the class tree's tempoBonus; and move speed is the Grove's alone, because
 * there is nothing in the ring to walk across.
 */
/**
 * The same perk bag with the tree's own contributions subtracted back out.
 *
 * ⚠️ SUBTRACTED RATHER THAN REBUILT. perks is the tree plus the arena upgrades summed per key, so a
 * second pass that simply omitted the tree would also drop whatever an upgrade put in the same key --
 * and the diff would then credit the class with an upgrade's number, which is the one direction a
 * readout must never be wrong in.
 */
function withoutTree(perks, tree) {
    const out = { ...(perks || {}) };
    for (const [k, v] of Object.entries(tree || {})) out[k] = (Number(out[k]) || 0) - (Number(v) || 0);
    return out;
}

function addGroveStat(stats, bag, onTempo, onMove) {
    for (const [stat, v] of Object.entries(bag || {})) {
        if (!v) continue;
        const add = (k) => { stats[k] = (Number(stats[k]) || 0) + v; };
        if (stat === "might") add("might");
        else if (stat === "vitality") add("vitality");
        else if (stat === "armour") add("armor");
        else if (stat === "crit_rate") add("crit_chance");
        else if (stat === "crit_damage") add("crit_power");
        else if (stat === "life_steal") add("lifesteal");
        else if (stat === "ferocity") add("ferocity");
        else if (stat === "tenacity") add("tenacity");
        else if (stat === "attack_speed") onTempo?.(v);
        else if (stat === "move_speed") onMove?.(v);
        // rarity_find and emblem_find are read by the drop roll, not by the fighter, so they are
        // deliberately not in this list -- see bonusesFrom in grove.js.
    }
}

/** The fields the Grove scene actually reads. Everything else `fighterFrom` returns is Arena-only. */
function forGrove(f) {
    return {
        // Damage per swing, already through swingFrom's Might curve and the weapon multiplier.
        damage: Number(f.damage) || 0,
        // A share, not a percentage: critChanceFrom returns 0.17 for 17%. Can exceed 1 — the Arena treats
        // every whole 100% as one more guaranteed multiple, and the Grove does the same in swing().
        critChance: Math.max(0, Number(f.critChance) || 0),
        critMult: Math.max(1, Number(f.critMult) || 1),
        // Ferocity + weapon speed + the tree's tempoBonus. This is the ONE attack-speed number in the game.
        tempo: Math.max(0, Number(f.tempo) || 0),
        // Raw points. The per-point conversions live in the engine, so they are applied at the swing.
        haste: Math.max(0, Number(f.haste) || 0),
        lifesteal: Math.max(0, Number(f.lifesteal) || 0),
        // ── ⚠️ THE SHARES THAT RIDE ON TOP OF THE POINTS, WHICH THIS LIST WAS DROPPING ─────────
        // Luke: "all choices on your class must be honored." forGrove is an allowlist, and an allowlist
        // forgotten as the data grew is the bug that cost The Long Road a hundred unpaid fights. It was
        // doing it again one layer down: fighterFrom computes lifestealBonus and hasteBonus correctly,
        // the ring applies both, and this line never named them -- so Bloodletting, Bloodwarden and
        // Bloodscent, three nodes a player spent real points in, were worth exactly nothing in a zone.
        //
        // Points and shares are different things and both are needed: `lifesteal` above is raw points
        // through LIFESTEAL_PER_POINT, and this is the share the engine adds AFTER that conversion.
        lifestealBonus: Math.max(0, Number(f.lifestealBonus) || 0),
        hasteBonus: Math.max(0, Number(f.hasteBonus) || 0),
        stun: Math.max(0, Number(f.stun) || 0),
        // Shares already.
        bleedChance: Math.max(0, Math.min(1, Number(f.bleedChance) || 0)),
        bleedDamage: Math.max(0, Number(f.bleedDamage) || 0),
        bleedLeech: Math.max(0, Math.min(1, Number(f.bleedLeech) || 0)),
        // Flat armour, and the health the body is worth.
        armor: Math.max(0, Number(f.armor) || 0),
        health: Math.max(1, Number(f.health) || 1),
        dmgPct: Math.max(0, Number(f.dmgPct) || 0),
        might: Math.max(0, Number(f.might) || 0),
    };
}

/**
 * This member's Grove fighter: gear, compendium, pets, badges, casino tracks and the class tree.
 *
 * Best-effort by design — a member with no class, no pet and no badges still gets a fighter, because the
 * Grove has to open for somebody who has never touched the Arena.
 */
export async function groveFighter(buyerId) {
    if (!buyerId) return { ...forGrove(fighterFrom({}, {}, null)), moveSpeed: 0 };
    try {
        const { getEquippedIds, getEquippedStats } = await import("@/lib/marketplace/inventory.js");
        // ⚠️ getEquippedIds RETURNS A {slot -> id} OBJECT. Iterating it directly is a known landmine here —
        // see [[marketplace-equipped-shape-landmine]].
        const bySlot = await getEquippedIds(buyerId).catch(() => ({}));
        const ids = Object.values(bySlot || {}).filter(Boolean);
        const gearStats = await getEquippedStats(buyerId).catch(() => ({}));
        const stats = await combatStats(buyerId, gearStats, ids);

        // ── THE GROVE'S OWN EMBLEMS JOIN THE SAME POOL ───────────────────────────────────────────────
        // ⚠️ AS STAT POINTS, NOT AS A SECOND SET OF NUMBERS BOLTED ON AFTERWARDS. They used to be the
        // ONLY thing the hero had, summed in the client into a flat `power`. Folding them in here instead
        // means an emblem's Might goes through swingFrom's curve exactly as a sword's does, composes with
        // gear rather than sitting beside it, and — the part that matters — there is one place that knows
        // what a point of Might is worth.
        //
        // The names differ because the two systems were written apart: the Grove calls it `might` and
        // `crit_rate`, the pool calls it `might` and `crit_chance`. Mapped once, here.
        const embRows = await db.query(
            `SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1 AND slot IS NOT NULL`,
            [buyerId]
        ).catch(() => []);
        let emblemTempo = 0;
        let moveSpeed = 0;
        for (const row of embRows || []) {
            const meta = GROVE_EMBLEMS[row.emblem_id];
            if (!meta) continue;
            // Stars are earned by HOW MANY you have collected, not by the one you slotted.
            const { stars } = emblemStars(Number(row.count) || 0);
            if (!stars) continue;
            addGroveStat(stats, { [meta.stat]: meta.per * stars },
                (v) => { emblemTempo += v / 100; }, (v) => { moveSpeed += v; });
        }

        // ── ⚠️ THE BOSS SETS JOIN THE SAME POOL, THROUGH THE SAME MAPPING ───────────────────────────
        // Luke: "you can make boss armor that is a set in game."
        //
        // Deliberately the SECOND loop over the same `add` and the same stat names rather than a parallel
        // path: armour and emblems are two ways to wear a thing, and the moment they are two ways to
        // CALCULATE a thing they start disagreeing about what a point of Might is. The names are mapped
        // once, in the block above, and this reuses that mapping verbatim.
        //
        // ⚠️ THE SET BONUS IS WHY THIS READS THE WHOLE WARDROBE AND NOT JUST THE SLOTS. Three pieces of
        // one set pays stats that NO individual piece pays -- so the bonus cannot be computed per row, it
        // needs the count of worn pieces per set first.
        const armRows = await db.query(
            `SELECT piece_id FROM mkt_grove_armour WHERE buyer_id = $1 AND worn`, [buyerId]
        ).catch(() => []);
        const wornBySet = {};
        for (const row of armRows || []) {
            const piece = pieceById(row.piece_id);
            if (!piece) continue;
            wornBySet[piece.setId] = (wornBySet[piece.setId] || 0) + 1;
            addGroveStat(stats, piece.stats, (v) => { emblemTempo += v / 100; }, (v) => { moveSpeed += v; });
        }
        for (const [setId, worn] of Object.entries(wornBySet)) {
            if (worn < ARMOUR_SLOTS.length) continue;
            addGroveStat(stats, setBonusFor(setId), (v) => { emblemTempo += v / 100; }, (v) => { moveSpeed += v; });
        }

        const prog = await db.queryOne(
            `SELECT arena_class, skill_tree, upgrades FROM mkt_arena WHERE buyer_id = $1`, [buyerId]
        ).catch(() => null);
        const classId = prog?.arena_class || null;
        const tree = treeEffects(classId, prog?.skill_tree || {});
        const ups = upgradeEffects(prog?.upgrades || {});
        const perks = {};
        for (const k of new Set([...Object.keys(tree || {}), ...Object.keys(ups || {})])) {
            perks[k] = (Number(tree?.[k]) || 0) + (Number(ups?.[k]) || 0);
        }
        perks.tempoBonus = (Number(perks.tempoBonus) || 0) + emblemTempo;

        // ── ⚠️ WHO YOU ARE COMES OUT WITH WHAT YOU HIT FOR ────────────────────────────────────────
        // Luke: readability. The class tree has been folded into this fighter since grove-kit was
        // written -- a Reaver's Rend and a Warden's Bulwark genuinely change how a dive goes -- and both
        // the class id and the tree's contribution were computed here and dropped on this line. So the
        // Grove honoured the player's class perfectly and never once said it had.
        //
        // ⚠️ THE TREE ALONE, NOT `perks`. perks is the tree PLUS the arena upgrades, and attributing an
        // upgrade's number to the class would be a readout that lies in the player's favour -- the exact
        // kind of wrong that nobody reports because it flatters them. The upgrades have their own screen.
        const mine = forGrove(fighterFrom(stats, perks, classId));

        // ── ⚠️ WHAT THE CLASS IS WORTH HERE, ASKED OF THE ENGINE RATHER THAN DESCRIBED ────────────
        // The obvious readout is a list of the nodes you have taken, and it would be wrong: the three
        // trees grant about thirty distinct stats and the Grove's engine reads fourteen. A Warden's
        // Thornmail and Bastion are real points spent on nodes this zone does not implement, so a screen
        // listing them says "your class is doing this here" about things it is not doing.
        //
        // So the difference is MEASURED: build the same fighter with the tree and without it, and report
        // where the Grove's own numbers actually moved. It cannot drift from the engine because it is the
        // engine answering, it needs no table of stat names to maintain, and the day a node is added or
        // the Grove starts reading thorns, this is right on its own. Pure arithmetic over values already
        // in memory -- no query, nothing to bill.
        // ⚠️ SPREADING THE NEGATIVES OVER perks WOULD NOT SUBTRACT, IT WOULD REPLACE -- and the first
        // cut of this line did exactly that, which credits the class with every upgrade sharing a key.
        const without = forGrove(fighterFrom(stats, withoutTree(perks, tree), classId));
        const classGives = {};
        for (const k of Object.keys(mine)) {
            const d = (Number(mine[k]) || 0) - (Number(without[k]) || 0);
            if (Math.abs(d) > 1e-9) classGives[k] = d;
        }
        return { ...mine, moveSpeed, classId, classGives };
    } catch (error) {
        logger.warn("grove_kit.failed", { message: error?.message });
        // A broken lookup must not shut the Grove — it falls back to the neutral fighter, which is what an
        // account with nothing equipped would get anyway.
        return { ...forGrove(fighterFrom({}, {}, null)), moveSpeed: 0, classId: null, classGives: {} };
    }
}
