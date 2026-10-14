import "server-only";

import { db } from "@/lib/db.js";
import { combatStats, fighterFrom } from "@/lib/marketplace/arena.js";
import { treeEffects } from "@/lib/marketplace/arena-classes.js";
import { upgradeEffects } from "@/lib/marketplace/arena-upgrades.js";
import { GROVE_EMBLEMS, emblemStars } from "@/lib/marketplace/grove-catalog.js";
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
            const v = meta.per * stars;
            const add = (k) => { stats[k] = (Number(stats[k]) || 0) + v; };
            if (meta.stat === "might") add("might");
            else if (meta.stat === "vitality") add("vitality");
            else if (meta.stat === "armour") add("armor");
            else if (meta.stat === "crit_rate") add("crit_chance");
            else if (meta.stat === "crit_damage") add("crit_power");
            else if (meta.stat === "life_steal") add("lifesteal");
            else if (meta.stat === "ferocity") add("ferocity");
            else if (meta.stat === "tenacity") add("tenacity");
            // Attack speed is a PERCENT on the emblem and tempo is a rate, so it rides the tree's own
            // channel for exactly this — the one the node cards quote.
            else if (meta.stat === "attack_speed") emblemTempo += v / 100;
            // Move speed is the Grove's alone: there is nothing in the ring to walk across.
            else if (meta.stat === "move_speed") moveSpeed += v;
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

        return { ...forGrove(fighterFrom(stats, perks, classId)), moveSpeed };
    } catch (error) {
        logger.warn("grove_kit.failed", { message: error?.message });
        // A broken lookup must not shut the Grove — it falls back to the neutral fighter, which is what an
        // account with nothing equipped would get anyway.
        return { ...forGrove(fighterFrom({}, {}, null)), moveSpeed: 0 };
    }
}
