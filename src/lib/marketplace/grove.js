import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { craftLevel, craftXpFor, rollQuality, qualityBand, qualityOdds, QUALITY_BANDS, toolBonusFor, GROVE_CHESTS,
    ARMOUR_PIECES, pieceById, setBonusFor, GROVE_SETS, craftBonusFor, charmValue, charmValueOf } from "@/lib/marketplace/grove-forge.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { mint } from "@/lib/marketplace/gold-rate.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { canPreview } from "@/lib/marketplace/owner.js";
import {
    GROVE_ZONES, GROVE_ENEMIES, GROVE_RARE, GROVE_PARTS, GROVE_EMBLEMS, GROVE_POP,
    GROVE_FOODS, GROVE_CHARMS, HEAL_AT, emblemStars, groveZone,
    GROVE_BOSSES, GROVE_HYPER, BOSS_COOLDOWN_MS, bossHyperChance, groveBoss as bossById,
} from "@/lib/marketplace/grove-catalog.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { petBiteShare } from "@/lib/marketplace/grove-world.js";
import { reworkCost, temperCost, toolRecipeFor } from "@/lib/marketplace/grove-recipes.js";
import { rackFor, scatterFor, landingFor, bandAt, oddsForAim, rattle, qualityInBand,
    clampAct, actScore } from "@/lib/marketplace/grove-craft-act.js";
import { settleKills, rollBoss, rollGroveChest } from "@/lib/marketplace/grove-roll.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { groveFighter } from "@/lib/marketplace/grove-kit.js";
import { grantStone } from "@/lib/marketplace/pet-ascension.js";
import { grantDecoration } from "@/lib/marketplace/farm-decorations.js";
import { GROVE_PLOT_CAP } from "@/lib/marketplace/farm-crops.js";
import {
    GROVE_RECIPES, recipeById, recipeMap, tabletBonuses, TOOL_SLOTS, toolBonusPct,
} from "@/lib/marketplace/grove-recipes.js";
import { mapIsBuilt } from "@/lib/marketplace/grove-maps.js";

// ── THE GROVE, SERVER SIDE ───────────────────────────────────────────────────────────────────────────────────
// The client plays the whole scene (see grove-roll.js for why). This file does the four things the client is
// not allowed to do: issue the seed, grant what the seed produces, hold the bag and the bank, and craft.
//
// ⚠️ OWNER-GATED, PLUS INVITED TESTERS. Luke: "We will start by owner gating all of this." One door,
// checked in one place — the page, the HUD that draws the menu entry, and all eight server actions below
// every ask THIS, so a name added to the guest list opens the door and the menu together. A second copy of
// the rule in the nav is how you ship a menu entry that leads to a redirect. See
// [[feature-gates-come-in-pairs]].
//
// `canPreview` already passes owners without them being listed, so this is strictly wider than isOwner was.
// Guests are named per feature in owner.js and deliberately NOT added to OWNER_BUYER_IDS: that list is
// checked in 44 files and decides casino controls, credit checkout, the role system and pet drops, none of
// which an invitation to test a forest minigame should carry. See [[preview-guests-not-owner-list]].
export const groveOpen = (buyerId) => canPreview("grove", buyerId);

const ZONE_BY_ID = Object.fromEntries(GROVE_ZONES.map((z) => [z.id, z]));
const foeById = (id) => (id === GROVE_RARE.id ? GROVE_RARE : GROVE_ENEMIES[id] || null);

// ── WHERE THE SERVER KEEPS AUTHORITY ─────────────────────────────────────────────────────────────────────────
// Luke: "we need to strike a balance between cost and server authority ... since we cant push all of it on the
// client due to exploits and responsiveness. But if we can save cost we should."
//
// The three checks below are the balance. Every one of them costs ZERO extra queries — they are arithmetic and
// table lookups against data already in memory — and between them they close the only lies the client can
// tell. Motion, targeting, telegraph timing, camera and loot spill stay on the client, because those are
// presentation and must be instant; what you GET and HOW FAST you can get it stay here.
//
//   1. the loot roll        already server-side (grove-roll.js) — the client cannot invent a drop
//   2. zone membership      you cannot claim a creature that does not live in that zone
//   3. a rolling window     bounded by wall clock, which nothing the client does can reset
//
// ── 1. THE ROLLING WINDOW ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS USED TO RESET EVERY TIME YOU WALKED IN. groveEnter set kills_settled = 0, so the "session budget"
// was really a budget per ENTRY: enter, settle the maximum, leave, enter again, repeat for ever. The guard
// existed and was free to walk around.
//
// It is wall-clock now. A zone holds at most GROVE_POP.max and refills every respawnMs, so there is a hard
// physical roof on kills per minute, and entering more often does not create more enemies.
//
// Generous on purpose (3x): a laggy phone settling ninety seconds of play in one burst must never be punished
// for it. This stops a thousand-kill claim, not a fast player.
const KILL_CEILING_SLACK = 3;
export const KILL_WINDOW_MS = 10 * 60 * 1000;

export function killCeiling(elapsedMs) {
    const windows = Math.max(1, Math.ceil((Number(elapsedMs) || 0) / GROVE_POP.respawnMs));
    return (GROVE_POP.max * windows + GROVE_POP.max) * KILL_CEILING_SLACK;
}

// ── 2. ZONE MEMBERSHIP ───────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE WORST EXPLOIT THAT WAS OPEN, AND THE CHEAPEST TO CLOSE. Nothing checked that a claimed kill belonged
// to the zone it was claimed in — so a settle could report twelve Elderlings in Thicket Edge and be handed
// tier-6 Elder Heartwood on the first node of the map, skipping the entire thing. A Set built from the zone's
// own enemy list, which is already in memory. No query, no cost.
function allowedIn(zone) {
    // ⚠️ THE BOSS IS DELIBERATELY NOT IN THIS SET. It used to be, back when a zone's "boss" was just one of
    // its own wanderers. It has its own verb now (groveBoss) with its own thirty-minute cooldown, and that
    // cooldown is the only throttle on the hyper-rare drops it feeds — so if settle still accepted the id, a
    // burst of two hundred claimed boss kills would walk straight around it.
    return new Set([...(zone.enemies || []), GROVE_RARE.id]);
}

async function playerRow(buyerId) {
    const row = await db.queryOne(`SELECT * FROM mkt_grove_player WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (row) return row;
    await db.query(`INSERT INTO mkt_grove_player (buyer_id) VALUES ($1) ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    return db.queryOne(`SELECT * FROM mkt_grove_player WHERE buyer_id = $1`, [buyerId]).catch(() => null);
}

/** Emblem-derived multipliers, which the roll needs and the client is told so its preview matches. */
// ── ⚠️ AND THE CHARM BURNING ON THIS RUN, IF THERE IS ONE ───────────────────────────────────────────────────
// A charm pays into these same three numbers and into nothing else, which is why it needed no new plumbing:
// the drop roll already reads rarityFind, emblemFind and rareSpawn, and a charm simply adds to one of them.
//
// ⚠️ THE SECOND ARGUMENT IS NOT OPTIONAL IN SPIRIT. The roll runs twice for every kill — once in the scene,
// so the player watches the part fall, and once on the server at settle, which is the version that counts.
// Both sides must be handed the SAME bundle or they diverge, and a divergence here is a drop the player saw
// and never received. Every call site passes the player row; the charm travels with the session on that
// row, which is also why a charm cannot expire mid-run. See migration 483.
function bonusesFrom(emblemRows, player = null) {
    const out = { rarityFind: 0, emblemFind: 0, rareSpawn: 0 };
    const charmId = player?.charm_id;
    if (charmId && GROVE_CHARMS[charmId]) {
        const stat = GROVE_CHARMS[charmId].stat;
        if (stat in out) out[stat] += charmValue(charmId, player.charm_band);
    }
    for (const r of emblemRows || []) {
        const meta = GROVE_EMBLEMS[r.emblem_id];
        if (!meta || r.slot === null || r.slot === undefined) continue;   // only EQUIPPED emblems apply
        const { stars } = emblemStars(r.count);
        if (!stars) continue;
        const v = Number(meta.per) * stars;
        if (meta.stat === "rarity_find") out.rarityFind += v;
        else if (meta.stat === "emblem_find") out.emblemFind += v;
        else if (meta.stat === "rare_spawn") out.rareSpawn += v;
    }
    return out;
}

/**
 * Who the hero and the pet look like.
 *
 * ⚠️ ONE QUERY FOR BOTH, VIA A JOIN. The pet sprite is keyed on the member's featured_collectible, which
 * lives on the same row, so asking separately would have been two round trips for two strings — and round
 * trips are the meter that bills. See CLAUDE.md.
 *
 * ⚠️ A NULL URL IS RETURNED AS NULL AND MUST STAY THAT WAY. The scene renders no <img> at all rather than
 * one with a broken src: an SSR 404 fires onError before React hydrates, so an onError fallback never runs and
 * the player gets the browser's broken-image glyph. See img-onerror-fires-before-hydration.
 */
async function heroLook(buyerId) {
    // ⚠️ b.id::text, AND THE CAST IS LOAD-BEARING. mkt_pet_level.buyer_id is TEXT while mkt_buyer.id is
    // UUID, so the uncast join throws "operator does not exist: text = uuid" — and the .catch below turns
    // that into a null row, which means NO HERO SPRITE, NO PET SPRITE AND NO BITE for every player in the
    // game. It shipped exactly that way: the build does not run queries, the bench passes its own
    // fixtures, and the CDP probe read the bench — so every gate was green while the live Grove rendered
    // two coloured discs. Found only by signing in and looking at it. See [[postgres-landmines]].
    const row = await db.queryOne(
        `SELECT b.avatar_sprite_url AS hero, ps.url AS pet, b.featured_collectible AS pet_id,
                COALESCE(pl.xp, 0) AS pet_xp
           FROM mkt_buyer b
           LEFT JOIN mkt_pet_sprite ps ON ps.pet_id = b.featured_collectible
           LEFT JOIN mkt_pet_level pl ON pl.buyer_id = b.id::text AND pl.pet_id = b.featured_collectible
          WHERE b.id = $1`, [buyerId],
    ).catch((error) => {
        // ⚠️ LOUD, THEN NULL. Falling back to "no art" is correct -- the Grove must open for somebody whose
        // avatar row is genuinely missing -- but a THROWN query and an empty one are not the same event and
        // this used to report them identically. A type mismatch in the join above was invisible for exactly
        // that reason. The fallback stays; the silence does not.
        console.error("grove.heroLook failed", error?.message);
        return null;
    });
    // ── ⚠️ WHO THE PET IS, NOT JUST WHAT IT LOOKS LIKE ──────────────────────────────────────────────
    // Luke: "I want the pet that you have equipped to matter in the grove, like its level, its rarity."
    //
    // So the scene needs the pet's rarity and level, and the cheapest place to get them is the row that
    // was already being read for its picture: two more columns and one more LEFT JOIN on the same query.
    // mkt_pet_level is keyed (buyer_id, pet_id) and a pet with no row is implicitly Lv1 at 0 xp, which is
    // what the COALESCE says. Asking separately would have been a second round trip for a number already
    // sitting on the same row — and round trips are the meter that bills. See CLAUDE.md.
    //
    // THE SHARE IS COMPUTED HERE, ONCE, rather than handing the client a rarity and a level to multiply.
    // The scene gets one number it can only use the way it was meant, the balance table stays on the
    // server where the rest of the Grove's numbers live, and a tampered client cannot invent a rarity.
    const pet = row?.pet_id ? collectibleById(row.pet_id) : null;
    const petLevel = pet ? petLevelForXp(row?.pet_xp || 0, pet.rarity) : 0;
    return {
        heroArt: row?.hero || null,
        petArt: row?.pet || null,
        // No pet equipped is a share of ZERO, which is the one case petBiteShare is never asked about: it
        // fails rarity UPWARD by design, so handing it a null rarity would arm an empty collar with a
        // primordial bite.
        petBite: pet ? petBiteShare(pet.rarity, petLevel) : 0,
        petLevel,
    };
}

/** The whole screen: where you are, what you carry, what you have seen, what you can make. */
export async function groveState(buyerId) {
    if (!buyerId || !groveOpen(buyerId)) return { ok: false, error: "closed" };

    const [p, zones, items, seen, emblems, tools, chests, craftLog, armour, charms, look, hero] = await Promise.all([
        playerRow(buyerId),
        // ⚠️ THE COOLDOWN IS COMPUTED IN SQL, ON THE QUERY THIS ALREADY RAN. Two reasons. It costs nothing
        // — no extra round trip, and round trips are the meter that bills. And the comparison happens where
        // the timestamps live: the session zone here is UTC, and doing timestamptz arithmetic in Node is how
        // every date bug in this repo has started. See postgres-landmines.
        db.query(
            `SELECT zone_id, kills, boss_done, boss_kills,
                    GREATEST(0, EXTRACT(EPOCH FROM (boss_at + ($2 || ' milliseconds')::interval - NOW())) * 1000)::bigint AS boss_wait_ms
               FROM mkt_grove_zone WHERE buyer_id = $1`,
            [buyerId, String(BOSS_COOLDOWN_MS)],
        ).catch(() => []),
        db.query(`SELECT place, part_id, qty FROM mkt_grove_item WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT part_id FROM mkt_grove_seen WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT slot, tier, quality, reworks FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT tier, qty FROM mkt_grove_chest WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        // ⚠️ RECALL. Luke: the crafting level needs "visibility transparency recall and awareness". A level
        // with no history behind it is a number the player is asked to take on faith -- and this one is a
        // ladder they are being asked to climb, so "what have I actually made, and how did it come out"
        // has to be answerable on the same screen. Twelve is enough to show a run without becoming a log.
        db.query(
            `SELECT recipe_id, kind, xp, quality, created_at
               FROM mkt_grove_craft_log WHERE buyer_id = $1
              ORDER BY created_at DESC LIMIT 12`, [buyerId],
        ).catch(() => []),
        db.query(`SELECT piece_id, worn FROM mkt_grove_armour WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        // ⚠️ IN THE SAME Promise.all, NOT A FOURTEENTH ROUND TRIP. Round trips are the meter that
        // bills — see CLAUDE.md — and this is one more row set on a query set that is already in flight.
        db.query(`SELECT charm_id, band, qty FROM mkt_grove_charm WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        heroLook(buyerId),
        // ⚠️ WHAT THE PLAYER ACTUALLY BUILT. Gear, forge, sets, jewels, compendium, pet, badges, casino
        // tracks and the class tree, through the Arena's own combatStats + fighterFrom. Before this the
        // hero was a hardcoded 12 power and none of it reached the Grove. See grove-kit.js.
        groveFighter(buyerId),
    ]);

    const killsBy = Object.fromEntries((zones || []).map((z) => [z.zone_id, z]));
    const seenSet = new Set((seen || []).map((r) => r.part_id));
    // ⚠️ FOOD SHARES mkt_grove_item WITH PARTS AND IS SPLIT OUT HERE. It occupies a bag slot exactly like a
    // part does — which is the whole tension of the belt: carrying healing costs you carrying loot — but the
    // workbench must not offer to craft a poultice OUT OF poultices, so the two are separated by identity
    // rather than by table.
    const pack = {};
    const bank = {};
    const food = {};
    for (const r of items || []) {
        if (GROVE_FOODS[r.part_id]) { food[r.part_id] = Number(r.qty); continue; }
        (r.place === "bank" ? bank : pack)[r.part_id] = Number(r.qty);
    }

    return {
        ok: true,
        ...look,
        hero,
        unlockedN: Number(p?.unlocked_n) || 1,
        packSlots: Number(p?.pack_slots) || 16,
        bankSlots: Number(p?.bank_slots) || 16,
        packsBuilt: p?.packs_built || [],
        banksBuilt: p?.banks_built || [],
        plotsBuilt: p?.plots_built || [],
        zones: GROVE_ZONES.map((z) => {
            const row = killsBy[z.id];
            const kills = Number(row?.kills) || 0;
            const b = GROVE_BOSSES[z.boss];
            // bigint comes back as a STRING from the HTTP driver, so Number() is not optional here.
            const wait = Math.max(0, Number(row?.boss_wait_ms) || 0);
            return {
                // `map` and `mapName` ride along so the chart can show one paper at a time. They are on the
                // zone itself rather than derived from n, because a client doing (n - 1) / 12 would be a
                // second place that has to agree about how many zones a map has.
                ...z,
                map: z.map || 1,
                mapName: z.mapName || "The Grove",
                kills,
                bossDone: Boolean(row?.boss_done),
                unlocked: z.n <= (Number(p?.unlocked_n) || 1),
                // The boss, and the two things that decide whether you may fight it. Luke: "Each zone would
                // end with a boss." Clearing the zone earns the fight; the timer spaces it out.
                // ⚠️ bossDef, NOT boss. The catalogue's zone.boss is the string ID, and overwriting it here
                // with the resolved object made groveBoss(zone.boss) look up an object and find nothing
                // — so the boss silently never spawned, while every flag around it said it should.
                // A field that means a string in one place and an object in another is a bug waiting
                // for whoever reads the other one.
                bossDef: b ? { id: b.id, name: b.name, art: b.art, hp: b.hp, attacks: b.attacks } : null,
                bossCleared: kills >= z.toUnlock,
                bossWaitMs: wait,
                bossReady: kills >= z.toUnlock && wait <= 0,
                bossKills: Number(row?.boss_kills) || 0,
            };
        }),
        pack,
        bank,
        food,
        // What auto-eats, and the threshold it fires at. Luke: "if you get below 60 percent hp."
        belt: p?.belt || null,
        healAt: HEAL_AT,
        foods: GROVE_FOODS,
        // One row per slot holding the best tier reached. Map two raises these; nothing here changes.
        tools: Object.fromEntries((tools || []).map((t) => [t.slot, Number(t.tier) || 0])),
        // Kept beside the tier rather than folded into it: the screen wants to SAY "Fine" and the bonus
        // maths wants the number, and a single merged value could serve neither without being decoded.
        toolQuality: Object.fromEntries((tools || []).map((t) => [t.slot, t.quality == null ? null : Number(t.quality)])),
        // How many times each tool has been reworked. Beside the quality because it is the same fact seen
        // from the other side: what it came out at, and how many tries that took.
        toolReworks: Object.fromEntries((tools || []).map((t) => [t.slot, Number(t.reworks) || 0])),
        // ⚠️ THE GROVE'S OWN CHESTS, NOT mkt_chest. See the note on the boss grant.
        chests: Object.fromEntries((chests || []).map((c) => [c.tier, Number(c.qty) || 0])),
        // ⚠️ OWNED AND WORN AS TWO SHAPES, NOT ONE LIST WITH A FLAG. The armoury asks "do I have this
        // piece" fifteen times while it renders, and "what is in this slot" three times; a flat list
        // makes both of those a scan. The catalogue stays the only thing that knows what a piece IS.
        armour: {
            owned: (armour || []).map((r) => r.piece_id),
            worn: Object.fromEntries((armour || []).filter((r) => r.worn)
                .map((r) => [pieceById(r.piece_id)?.slot, r.piece_id]).filter(([k]) => k)),
        },
        merits: Number(p?.merits) || 0,
        craft: {
            ...craftLevel(Number(p?.craft_xp) || 0),
            // ⚠️ THE ODDS ARE SENT, NOT DESCRIBED. "Higher levels improve your rolls" is a claim; the
            // actual band shares at THIS level are a fact the player can check against what they get.
            // Computed from the same curve the server rolls against, so the screen cannot drift from it.
            odds: qualityOdds(craftLevel(Number(p?.craft_xp) || 0).level),
            // ⚠️ AND THE TEMPERED ODDS BESIDE THEM, FROM THE SAME CURVE. The bench shows both columns so
            // the player can see what the extra parts actually buy before spending them — a "better
            // chance" with no number is a thing you are asked to believe rather than a decision you can
            // make. Same function, one flag, so the two can never drift apart.
            oddsTempered: qualityOdds(craftLevel(Number(p?.craft_xp) || 0).level, true),
            recent: (craftLog || []).map((r) => ({
                recipe: r.recipe_id,
                kind: r.kind,
                xp: Number(r.xp) || 0,
                quality: r.quality == null ? null : Number(r.quality),
                band: r.quality == null ? null : qualityBand(Number(r.quality)).id,
                at: r.created_at,
            })),
        },
        toolMeta: TOOL_SLOTS.map((t) => ({
            ...t,
            tier: Number((tools || []).find((x) => x.slot === t.slot)?.tier) || 0,
            quality: (tools || []).find((x) => x.slot === t.slot)?.quality ?? null,
            // ⚠️ THE REPORTED BONUS NOW INCLUDES THE QUALITY, because that is what the tool actually
            // gives. A screen showing the tier's base while the game applied a multiplied number would
            // be lying in the one place a player checks whether crafting well was worth it.
            pct: toolBonusFor(
                (tools || []).find((x) => x.slot === t.slot)?.tier || 0,
                (tools || []).find((x) => x.slot === t.slot)?.quality ?? null,
            ),
        })),
        seen: [...seenSet],
        // The tablet: what you have seen out of everything there is, and what that is worth.
        // ⚠️ THE DENOMINATOR IS WHAT YOU CAN ACTUALLY FIND. GROVE_PARTS holds every material in the world,
        // including the 132 designed for maps nobody can walk into yet; counting those turns "16 of 16,
        // every part discovered" into "16 of 148" and reads as eleven twelfths of the game missing rather
        // than not built. The tablet is a record of what the Grove has shown you, so it counts what the
        // Grove can show you.
        tablet: {
            seen: seenSet.size,
            total: Object.values(GROVE_PARTS).filter((p) => mapIsBuilt(p.map ?? 1)).length,
            bonuses: tabletBonuses(seenSet.size),
        },
        // ── EVERY RECIPE, ALWAYS ────────────────────────────────────────────────────────────────────
        // ⚠️ THIS REVERSES A RULE THAT WAS DELIBERATE, so it is worth saying why rather than letting the
        // old comment in grove-recipes.js read as still true. The bench used to show only recipes whose
        // every part you had already seen — Luke: "You only see recipes once youve found the items that
        // require it". Played, it hid the thing a crafting screen is FOR: with 26 recipes and 16 parts a
        // new player saw an empty bench and no reason to pick up a root, and the shape of the map-1 goal
        // was invisible until it was nearly finished. Luke, after living with it: "I think we should see
        // all recipes instead of the silly find all to unlock."
        //
        // The seen-set is still sent and still matters — it drives the tablet and lets the bench grey the
        // parts you have never laid eyes on — it just no longer decides what you are allowed to read.
        //
        // ⚠️ "EVERY RECIPE" MEANS EVERY RECIPE OF A MAP YOU CAN WALK TO. The ladder is declared to tier XII
        // so it can be priced and read as a whole (grove-maps.js), which is 132 recipes asking for materials
        // that have no creature to drop them yet. Sending those would bury the twelve real ones in a list of
        // things nobody can make and nobody can work toward — the exact failure the "show them all" change
        // above was fixing, arriving from the other direction. mapIsBuilt is the line; raise MAPS_BUILT the
        // day a map's zones land and its recipes appear here on their own.
        // ⚠️ MINUS THE ONES A BOSS HAS NOT TAUGHT YET. The one narrow exception to "every recipe, always"
        // — see reachableRecipes. A charm recipe you have not earned is not greyed out on the bench, it is
        // absent, because a visible row you cannot act on is the wall this list exists to avoid and a
        // visible row labelled "beat a boss you have not reached" is a spoiler as well as a wall.
        recipes: GROVE_RECIPES.filter((r) => mapIsBuilt(recipeMap(r))
            && (!r.taughtBy || (p?.taught || []).includes(r.id))).map((r) => r.id),
        // What the bosses have taught, so the bench can run the same filter the server just ran.
        taught: p?.taught || [],
        // ── THE CHARMS IN HAND ──────────────────────────────────────────────────────────────────────
        // ⚠️ ONE ENTRY PER (charm, quality), BECAUSE THAT IS WHAT A STACK IS HERE. Two Rootwood Seekings
        // rolled Rough and Masterwork are different objects and the player picks between them at the
        // door; merging them into "2x Rootwood Seeking" would throw away the only thing that makes a
        // second one worth crafting.
        charms: (charms || []).map((c) => ({
            id: c.charm_id,
            band: c.band,
            qty: Number(c.qty) || 0,
            value: charmValue(c.charm_id, c.band),
            meta: GROVE_CHARMS[c.charm_id] || null,
        })).filter((c) => c.meta),
        // What is burning on the run in progress, if the player is mid-session.
        charmOn: p?.charm_id && GROVE_CHARMS[p.charm_id]
            ? { id: p.charm_id, band: p.charm_band, value: charmValue(p.charm_id, p.charm_band),
                meta: GROVE_CHARMS[p.charm_id] }
            : null,
        emblems: (emblems || []).map((e) => ({
            id: e.emblem_id, count: Number(e.count), slot: e.slot,
            ...emblemStars(Number(e.count)), meta: GROVE_EMBLEMS[e.emblem_id] || null,
        })),
        bonuses: bonusesFrom(emblems, p),
    };
}

/** Open a zone: hand back the seed the client plays from. */
export async function groveEnter(buyerId, zoneId, { charm = null } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const zone = groveZone(zoneId);
    if (!zone) return { ok: false, error: "no_zone" };
    const p = await playerRow(buyerId);
    if (zone.n > (Number(p?.unlocked_n) || 1)) return { ok: false, error: "locked" };

    // ── ⚠️ THE CHARM IS SPENT HERE, AT THE DOOR, AND IT IS SPENT WHETHER THE RUN GOES WELL OR NOT ───
    // That is the decision the charm exists to create: this zone, this dive, now — not a buff you hold
    // until the perfect moment, which is a buff nobody ever uses.
    //
    // ⚠️ THE DECREMENT IS THE GUARD, NOT A READ-THEN-WRITE. Same shape as opening a chest: "check you
    // have one, then take one" is two statements with a gap, and a double-tap on a slow connection walks
    // through it and burns a charm the player does not own. The UPDATE carries its own `qty > 0` and
    // RETURNING says whether it actually took anything.
    //
    // ⚠️ A FAILED TAKE IS NOT A FAILED ENTRY. Refusing the whole dive because a charm had already been
    // used would strand a player at the door over something optional; they go in without it instead, and
    // the payload says so.
    let charmOn = null;
    if (charm?.id && GROVE_CHARMS[charm.id] && QUALITY_BANDS.some((b) => b.id === charm.band)) {
        const took = await db.queryOne(
            `UPDATE mkt_grove_charm SET qty = qty - 1
              WHERE buyer_id = $1 AND charm_id = $2 AND band = $3 AND qty > 0 RETURNING qty`,
            [buyerId, charm.id, charm.band],
        ).catch(() => null);
        if (took) charmOn = { id: charm.id, band: charm.band };
    }
    // Written on the player row even when null, so last run's charm cannot haunt this one — a stale
    // charm_id would quietly pay a bonus nobody spent anything for, on every dive after the first.
    await db.query(
        `UPDATE mkt_grove_player SET charm_id = $2, charm_band = $3 WHERE buyer_id = $1`,
        [buyerId, charmOn?.id || null, charmOn?.band || null],
    ).catch(() => {});
    // ⚠️ AND THE LOCAL ROW IS UPDATED TOO, because `bonuses` below is built from it. Reading the charm
    // back out of the database would be a round trip for a fact we just wrote, and forgetting to do
    // either would hand the scene a bundle without the charm the player just burned — the exact
    // client/server divergence bonusesFrom exists to prevent.
    p.charm_id = charmOn?.id || null;
    p.charm_band = charmOn?.band || null;

    // ⚠️ ARMED AT THE DOOR, AND RETURNED, BECAUSE THE CLIENT'S STATE IS FROM BEFORE THE DOOR. groveState
    // was fetched when the Grove was opened; nothing refetches it on entry, so a belt armed here would not
    // reach the scene until the first settle forty-five seconds into the dive -- which is after the fight
    // it was armed for. The response carries it and GroveClient folds it into st.
    const beltArmed = await armBeltIfEmpty(buyerId, p).catch(() => null);

    // ⚠️ THE SEED IS THE SERVER'S. A client-chosen seed is a client that can shop for one that drops well.
    const seed = Math.floor(Math.random() * 0x7fffffff);
    await db.query(
        // ⚠️ kills_settled IS NO LONGER RESET HERE. It used to be, which made the kill ceiling a budget per
        // ENTRY rather than per unit of time — enter, settle the maximum, leave, enter again. The bound is
        // the rolling window now (see killCeiling), and nothing the client does resets a clock.
        `UPDATE mkt_grove_player SET seed = $2, seed_zone = $3, seed_at = NOW(), updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, seed, zoneId],
    ).catch(() => {});

    // ⚠️ THE SCENE READS zone.bossReady OFF THIS, NOT OFF groveState. The session's zone object comes from
    // here, so a boss that was only described in the state payload would never appear — the scene is
    // handed this one. Both have to answer the same question.
    const [emblems, zrow, look] = await Promise.all([
        db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.queryOne(
            `SELECT kills,
                    GREATEST(0, EXTRACT(EPOCH FROM (boss_at + ($3 || ' milliseconds')::interval - NOW())) * 1000)::bigint AS wait_ms
               FROM mkt_grove_zone WHERE buyer_id = $1 AND zone_id = $2`,
            [buyerId, zoneId, String(BOSS_COOLDOWN_MS)],
        ).catch(() => null),
        heroLook(buyerId),
    ]);

    const b = GROVE_BOSSES[zone.boss] || null;
    const kills = Number(zrow?.kills) || 0;
    const wait = Math.max(0, Number(zrow?.wait_ms) || 0);

    return {
        ok: true,
        seed,
        zone: {
            ...zone,
            kills,
            // ⚠️ bossDef, NOT boss — see the note in groveState. zone.boss stays the string id the
            // catalogue gave it, in every payload, so groveBoss() can resolve it on the client.
            bossDef: b ? { id: b.id, name: b.name, art: b.art, hp: b.hp } : null,
            bossCleared: kills >= zone.toUnlock,
            bossWaitMs: wait,
            bossReady: kills >= zone.toUnlock && wait <= 0,
        },
        pop: GROVE_POP,
        // What ended up on the belt, which may be something the player never chose — see armBeltIfEmpty.
        belt: beltArmed,
        bonuses: bonusesFrom(emblems, p),
        // What is burning on this run, so the scene can show it and the player can see what they paid for.
        charm: charmOn ? { ...charmOn, ...GROVE_CHARMS[charmOn.id], value: charmValue(charmOn.id, charmOn.band) } : null,
        ...look,
    };
}

/**
 * Settle a burst of kills.
 *
 * ⚠️ TAKES IDS AND INDEXES, NEVER ITEMS. The client says what it killed; the server decides what fell out.
 */
/**
 * Parts into the backpack, and into the permanent seen-set.
 *
 * ⚠️ THE BAG HAS A CEILING AND IT IS COUNTED IN ROWS. Sixteen "unique slots" means sixteen distinct parts,
 * not sixteen items — a part you already hold stacks for free, a new one needs a slot. Anything that does not
 * fit is simply not granted and the client is told, rather than silently vanishing.
 *
 * ⚠️ AND DISCOVERY IS SEEING, NOT KEEPING. A part that fell out while the bag was full was still FOUND, and
 * the recipe it unlocks must unlock. Luke was explicit: "If you get the first item and discard it or bank it,
 * then find the second part. The recipe unlocks, so its just based on discovery."
 *
 * Extracted so the boss and the settle share it rather than carrying two copies — a second copy of a rule
 * with this many edges in it is a second, slightly different game. See reuse-the-rule-never-restate-it.
 */
async function storeParts(buyerId, parts, packSlots) {
    const held = await db.query(
        `SELECT part_id FROM mkt_grove_item WHERE buyer_id = $1 AND place = 'pack' AND qty > 0`, [buyerId],
    ).catch(() => []);
    const heldSet = new Set((held || []).map((r) => r.part_id));

    const stored = {};
    const overflow = {};
    for (const [part, n] of Object.entries(parts || {})) {
        if (!heldSet.has(part) && heldSet.size >= packSlots) { overflow[part] = n; continue; }
        heldSet.add(part);
        stored[part] = n;
        await db.query(
            `INSERT INTO mkt_grove_item (buyer_id, place, part_id, qty) VALUES ($1, 'pack', $2, $3)
             ON CONFLICT (buyer_id, place, part_id) DO UPDATE SET qty = mkt_grove_item.qty + $3`,
            [buyerId, part, n],
        ).catch(() => {});
    }

    const newlySeen = [];
    for (const part of Object.keys(parts || {})) {
        const ins = await db.queryOne(
            `INSERT INTO mkt_grove_seen (buyer_id, part_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING RETURNING part_id`, [buyerId, part],
        ).catch(() => null);
        if (ins) newlySeen.push(part);
    }
    return { stored, overflow, newlySeen };
}

/**
 * Hand over one hyper-rare.
 *
 * ⚠️ EVERY BRANCH REACHES FOR A GRANT THAT ALREADY EXISTS. Luke listed "pet food to upgrade stones/free
 * enchant/free upgrade/free plot or sail upgrade" and all but one of those is already a thing this game can
 * give you — a free enchant IS an Enchantment Scroll, a free upgrade IS a Power Scroll, pet food IS a treat.
 * Minting a parallel token for any of them would have built a second, worse version of a working counter.
 *
 * The free plot is absent on purpose: it is a recipe, not a drop.
 */
async function grantHyper(buyerId, hyperId, meta = {}) {
    const row = GROVE_HYPER.find((h) => h.id === hyperId);
    if (!row) return null;
    if (row.kind === "consumable") {
        await grantConsumable(buyerId, row.ref, 1);
    } else if (row.kind === "stone") {
        // Two stones exist and they differ only in which way they change the pet, so neither is the better
        // prize — the coin flip is honest rather than a hidden downgrade.
        await grantStone(buyerId, Math.random() < 0.5 ? "light" : "dark", 1, "grove_boss").catch(() => {});
    } else if (row.kind === "ship_upgrade") {
        await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
        await db.query(`UPDATE mkt_sailing SET free_upgrades = free_upgrades + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    } else {
        return null;
    }
    await trackActivity(buyerId, "grove_hyper", { reward: row.id, ...meta }).catch(() => {});
    return { id: row.id, name: row.name, kind: row.kind };
}

export async function groveSettle(buyerId, { zoneId, kills = [], eaten = {} } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const zone = groveZone(zoneId);
    if (!zone) return { ok: false, error: "no_zone" };

    const p = await playerRow(buyerId);
    if (!p?.seed || p.seed_zone !== zoneId) return { ok: false, error: "no_session" };

    // ── THE THREE CHECKS ────────────────────────────────────────────────────────────────────────────
    const now = Date.now();
    const windowAt = new Date(p.kills_window_at || now).getTime();
    const windowFresh = now - windowAt > KILL_WINDOW_MS;
    const windowUsed = windowFresh ? 0 : (Number(p.kills_window) || 0);
    const ceiling = killCeiling(windowFresh ? KILL_WINDOW_MS : now - windowAt);

    // Membership first: a claim for a creature that does not live here is dropped outright rather than
    // trimmed, because it is not a fast player, it is a wrong one.
    const allowed = allowedIn(zone);
    const legal = (kills || []).filter((k) => allowed.has(k?.id));
    const rejected = (kills || []).length - legal.length;

    // Then the window. Trimmed rather than refused — a burst that overruns is far more likely to be a phone
    // catching up than an attack, and refusing it outright would lose honest play.
    const list = legal.slice(0, Math.max(0, ceiling - windowUsed));
    if (!list.length) return { ok: true, granted: null, parts: {}, capped: true, rejected };

    // ── FOOD EATEN IN THE ZONE ──────────────────────────────────────────────────────────────────────
    // ⚠️ DEBITED CONDITIONALLY, AND A SHORTFALL IS NOT AN ERROR. The scene eats when you drop below 60% and
    // reports how many it got through; the server takes what is actually there. It cannot verify the eating
    // — it does not track HP, because combat is the client's — so the honest guard is simply that you cannot
    // eat food you do not own. Claiming more than you have takes what you have and stops, which is the same
    // outcome as running out mid-fight.
    const ate = {};
    for (const [foodId, n] of Object.entries(eaten || {})) {
        if (!GROVE_FOODS[foodId]) continue;
        const want = Math.max(0, Math.round(Number(n) || 0));
        if (!want) continue;
        const row = await db.queryOne(
            `UPDATE mkt_grove_item SET qty = GREATEST(0, qty - $3) WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2
             RETURNING qty`, [buyerId, foodId, want],
        ).catch(() => null);
        if (row) ate[foodId] = want;
    }

    const emblemRows = await db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    // ⚠️ THE SAME ARGUMENTS THE SCENE PASSED, OR THE REPLAY LANDS SOMEWHERE ELSE. rollKill now takes the
    // zone depth and the hyper table; GroveScene passes zone.n and GROVE_HYPER, so this must too. An
    // argument present on one side and absent on the other is a stream that diverges mid-kill, which the
    // player experiences as a drop they watched fall and never received.
    const zoneN = Number(zone?.n) || 0;
    const got = settleKills(list, foeById, Number(p.seed), bonusesFrom(emblemRows, p), zoneN, GROVE_HYPER);

    const { stored, overflow, newlySeen } = await storeParts(buyerId, got.parts, Number(p.pack_slots) || 16);

    // ── EMBLEMS ─────────────────────────────────────────────────────────────────────────────────────
    for (const [em, n] of Object.entries(got.emblems)) {
        await db.query(
            `INSERT INTO mkt_grove_emblem (buyer_id, emblem_id, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, emblem_id) DO UPDATE SET count = mkt_grove_emblem.count + $3`,
            [buyerId, em, n],
        ).catch(() => {});
    }

    // ── XP, GOLD, CHESTS ────────────────────────────────────────────────────────────────────────────
    // ⚠️ gold: 0 IS LOAD-BEARING. awardXp pays gold 1:1 with points otherwise, and on a kill loop that is a
    // money printer. See awardxp-gold-tracks-xp-landmine.
    if (got.xp > 0) {
        await awardXp(buyerId, "grove", { points: got.xp, gold: 0 }).catch(() => {});
    }
    // Only ever from the rare spawn — see the roll.
    if (got.gold > 0) {
        const paid = mint(got.gold, "grove_rare");
        const after = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, paid]).catch(() => null);
        await logCoin(buyerId, paid, "grove_rare", { balanceAfter: after?.gold, meta: { zone: zoneId } }).catch(() => {});
    }
    for (const tier of got.chests) {
        await addChests(buyerId, { [tier]: 1 }, { source: "grove_rare" }).catch(() => {});
    }
    // ── ⚠️ THE HYPER-RARES, THROUGH THE BOSS'S OWN grantHyper ───────────────────────────────────────
    // Ordinary kills can now pay the hyper table at about one in two thousand. This grants them with the
    // function the boss already uses rather than a second path beside it -- two routes for one payout
    // always drift, and this repo has paid for that twice.
    // See [[atomic-split-into-steps-drops-lines]].
    const hypers = [];
    for (const h of got.hypers || []) {
        const paid = await grantHyper(buyerId, h, { zone: zoneId, from: "wanderer" }).catch(() => null);
        if (paid) hypers.push(paid);
    }

    // ── ZONE PROGRESS, AND THE UNLOCK ───────────────────────────────────────────────────────────────
    const z = await db.queryOne(
        `INSERT INTO mkt_grove_zone (buyer_id, zone_id, kills) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, zone_id) DO UPDATE SET kills = mkt_grove_zone.kills + $3
         RETURNING kills`,
        [buyerId, zoneId, list.length],
    ).catch(() => null);

    // ── ⚠️ SETTLE NO LONGER OPENS THE WAY. THE BOSS DOES. ──────────────────────────────────────────
    // This is where the unlock used to live, keyed on `kills >= toUnlock` — so the next zone opened on the
    // KILL COUNT and the boss standing at the end of the zone was scenery you could walk straight past.
    // Littlewolf, testing it, reached zone ten having killed nought bosses: the entire ladder skipped, and
    // every boss chest, merit and emblem skipped with it. Luke: "he is able to skip the area boss and go to
    // the next area. I dont like that."
    //
    // The catalogue always said these were two different jobs — see the toUnlock note in grove-catalog.js —
    // and now they actually are. Clearing a zone earns the RIGHT TO FIGHT its boss; killing the boss is what
    // ENDS the zone and opens the next one. See openTheWay, which is the only thing that moves unlocked_n.
    const cleared = Number(z?.kills) >= zone.toUnlock;

    // One UPDATE, folded into what settle already writes — the window costs no extra round trip. A stale
    // window is reset here rather than by a cron: the only thing that needs to know is the next settle.
    await db.query(
        `UPDATE mkt_grove_player
            SET kills_settled = kills_settled + $2,
                kills_window = CASE WHEN NOW() - kills_window_at > ($3 || ' milliseconds')::interval
                                    THEN $2 ELSE kills_window + $2 END,
                kills_window_at = CASE WHEN NOW() - kills_window_at > ($3 || ' milliseconds')::interval
                                       THEN NOW() ELSE kills_window_at END
          WHERE buyer_id = $1`,
        [buyerId, list.length, String(KILL_WINDOW_MS)],
    ).catch(() => {});
    await trackActivity(buyerId, "grove_settle", { zone: zoneId, kills: list.length }).catch(() => {});

    // ⚠️ RE-ARMED AFTER THE FOOD IS DEBITED, NOT BEFORE. The belt empties mid-dive, and a player who
    // crafted two kinds of poultice should carry on healing rather than discover at the bottom of a zone
    // that the slot went empty forty kills ago. armBeltIfEmpty only fills an empty slot, so this is a
    // no-op on every settle where there is still something to eat. The client picks it up on its refresh.
    const beltNow = await armBeltIfEmpty(buyerId).catch(() => null);

    return {
        ok: true,
        parts: stored,
        overflow,
        belt: beltNow,
        emblems: got.emblems,
        gold: got.gold,
        chests: got.chests,
        // Named in the response so the screen can say what arrived. The scene already celebrated it on the
        // kill; a reward announced in the world but missing from the receipt is half a reward.
        // See [[reward-with-no-screen-is-not-shipped]].
        hypers,
        xp: got.xp,
        newlySeen,
        ate,
        rejected,
        zoneKills: Number(z?.kills) || 0,
        // The zone is cleared; the boss is what opens the way now, so settle reports the right to FIGHT it
        // and nothing about the next zone. `unlocked` moved to the boss response.
        cleared,
        capped: list.length < (kills || []).length,
    };
}

/** Move a part between the bag and the bank. Slots are counted in ROWS at the destination. */
/**
 * Open the way to the next zone.
 *
 * ⚠️ ONE FUNCTION, AND THE BOSS KILL IS ITS ONLY CALLER. This used to be nine lines inline in settle keyed
 * on the kill count, which is how a tester walked to zone ten past ten live bosses. Two paths that both
 * move a player forward drift the moment one of them is edited — see
 * [[atomic-split-into-steps-drops-lines]] — so there is exactly one, and settle does not touch unlocked_n
 * at all any more.
 *
 * ⚠️ AND THE UPDATE CARRIES ITS OWN `unlocked_n < $2`. GREATEST alone would match every repeat kill of an
 * old boss and report the next zone as freshly opened each time, so the herald would fire on a door that
 * has been open for days. With the predicate the statement only matches when it genuinely advances, and
 * RETURNING hands back a row only then.
 */
async function openTheWay(buyerId, zone) {
    if (!zone || zone.n >= GROVE_ZONES.length) return null;
    const next = GROVE_ZONES[zone.n]; // zone.n is 1-based, so this is the one after it
    const up = await db.queryOne(
        `UPDATE mkt_grove_player SET unlocked_n = GREATEST(unlocked_n, $2), updated_at = NOW()
          WHERE buyer_id = $1 AND unlocked_n < $2 RETURNING unlocked_n`,
        [buyerId, next.n],
    ).catch(() => null);
    return up ? next : null;
}

/**
 * The boss at the end of a zone.
 *
 * Luke: "Each zone would end with a boss. Big health bar. Telegraphed attacks."
 *
 * ⚠️ ITS OWN VERB, NOT A KILL IN THE SETTLE BATCH, and that is a deliberate spend of one request. A boss
 * is at most one kill every thirty minutes per zone, so the traffic is nothing — and in exchange the two
 * things that guard it are checked against a row the server reads anyway:
 *
 *   1. you must have CLEARED the zone  (kills >= toUnlock) — the boss is the end of a zone, not a shortcut
 *      through it
 *   2. the cooldown must have elapsed — wall clock, which nothing the client does can reset
 *
 * Folding this into settle would have cost nothing extra and bought a hole: a burst of two hundred claimed
 * kills would have carried two hundred boss payouts through a guard that only looks at the batch total.
 */
export async function groveBoss(buyerId, zoneId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const zone = groveZone(zoneId);
    const boss = zone ? bossById(zone.boss) : null;
    if (!zone || !boss) return { ok: false, error: "no_zone" };

    const p = await playerRow(buyerId);
    if (!p?.seed || p.seed_zone !== zoneId) return { ok: false, error: "no_session" };

    const z = await db.queryOne(
        `SELECT kills, boss_at, boss_kills, boss_done FROM mkt_grove_zone WHERE buyer_id = $1 AND zone_id = $2`,
        [buyerId, zoneId],
    ).catch(() => null);

    // 1. the zone has to be cleared.
    if ((Number(z?.kills) || 0) < zone.toUnlock) {
        return { ok: false, error: "not_cleared", need: zone.toUnlock, have: Number(z?.kills) || 0 };
    }

    // 2. and the body has to have come back. ⚠️ COMPARED IN THE DATABASE, NOT IN NODE — the session zone
    // here is UTC and the column is timestamptz, and doing this arithmetic in JS is how the date landmines in
    // this repo have always started. See postgres-landmines.
    const ready = await db.queryOne(
        `SELECT (boss_at IS NULL OR NOW() - boss_at > ($3 || ' milliseconds')::interval) AS ok,
                GREATEST(0, EXTRACT(EPOCH FROM (boss_at + ($3 || ' milliseconds')::interval - NOW())) * 1000)::bigint AS wait_ms
           FROM mkt_grove_zone WHERE buyer_id = $1 AND zone_id = $2`,
        [buyerId, zoneId, String(BOSS_COOLDOWN_MS)],
    ).catch(() => null);
    if (ready && ready.ok === false) {
        // bigint comes back as a STRING from the HTTP driver.
        return { ok: false, error: "on_cooldown", waitMs: Number(ready.wait_ms) || 0 };
    }

    // The kill index continues the session stream, so the client and the server land on the same roll.
    const index = Number(p.kills_settled) || 0;
    const emblemRows = await db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const got = rollBoss(boss, zone.n, Number(p.seed), index, bonusesFrom(emblemRows, p), bossHyperChance(zone.n), GROVE_HYPER);

    const { stored, overflow, newlySeen } = await storeParts(buyerId, got.parts, Number(p.pack_slots) || 16);

    if (got.emblem) {
        await db.query(
            `INSERT INTO mkt_grove_emblem (buyer_id, emblem_id, count) VALUES ($1, $2, 1)
             ON CONFLICT (buyer_id, emblem_id) DO UPDATE SET count = mkt_grove_emblem.count + 1`,
            [buyerId, got.emblem],
        ).catch(() => {});
    }

    // ⚠️ gold: 0 IS LOAD-BEARING, same as in settle — awardXp pays gold 1:1 with points otherwise, and a
    // boss on a timer is a slower money printer but still a money printer. See awardxp-gold-tracks-xp-landmine.
    if (got.xp > 0) await awardXp(buyerId, "grove", { points: got.xp, gold: 0 }).catch(() => {});

    const hyper = got.hyper ? await grantHyper(buyerId, got.hyper, { zone: zoneId, boss: boss.id }) : null;

    // ── ⚠️ THE CHEST GOES IN THE GROVE'S OWN TABLE, NOT THROUGH addChests ─────────────────────────
    // Luke: "the chests are a parallel chest that have rare crafting goods for the grove."
    //
    // chests.js grants into mkt_chest, whose roll is a CHAIN across eight tiers paying Arena gear, gold
    // and coins -- and in a chain the first match wins, so adding anything to it silently steals from
    // every tier beneath. A Grove chest pays Grove parts out of its own roll and must stay out of that
    // table entirely. See [[chest-rolls-are-a-chain]].
    if (got.chest) {
        await db.query(
            `INSERT INTO mkt_grove_chest (buyer_id, tier, qty) VALUES ($1, $2, 1)
             ON CONFLICT (buyer_id, tier) DO UPDATE
                SET qty = mkt_grove_chest.qty + 1, updated_at = NOW()`,
            [buyerId, got.chest],
        ).catch(() => {});
    }
    // ⚠️ MERITS ARE NOT GOLD AND MUST NEVER TOUCH awardXp. awardXp pays gold 1:1 with points unless told
    // otherwise, which is the landmine two lines above this one; merits are their own column with one
    // faucet (this) and one sink (the boss sets). See [[awardxp-gold-tracks-xp-landmine]].
    if (got.merits > 0) {
        await db.query(
            `UPDATE mkt_grove_player SET merits = merits + $2, updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, got.merits],
        ).catch(() => {});
    }

    const after = await db.queryOne(
        `UPDATE mkt_grove_zone
            SET boss_at = NOW(),
                boss_kills = boss_kills + 1,
                boss_done = TRUE,
                first_clear_at = COALESCE(first_clear_at, NOW())
          WHERE buyer_id = $1 AND zone_id = $2
          RETURNING boss_kills, (first_clear_at >= NOW() - interval '5 seconds') AS was_first`,
        [buyerId, zoneId],
    ).catch(() => null);

    // ── ⚠️ AND THIS IS WHAT OPENS THE NEXT ZONE ───────────────────────────────────────────────────
    // Written AFTER boss_done above, deliberately. There is no transaction here (neon() is the HTTP driver
    // — see [[postgres-landmines]]), so the order of the two writes is the whole of the safety: a failure
    // here leaves a dead boss and a shut door, which the player fixes by killing it again. The other order
    // would leave an open door and a boss still standing, which nothing fixes.
    const unlocked = await openTheWay(buyerId, zone);

    // ── ⚠️ AND THIS IS WHERE A RECIPE IS TAUGHT ───────────────────────────────────────────────────
    // The only way a charm recipe ever reaches the bench. Every other row on that screen has been visible
    // since the day the account was made -- which is right, and is also why nothing there can be found.
    //
    // ⚠️ TAUGHT ONCE, AND SILENTLY IF ALREADY KNOWN. array_append on a repeat kill would grow the column
    // for ever and the bench would show the same recipe four times. The guard is in the WHERE, not in a
    // read before it, because a boss killed twice in two tabs must not write two rows.
    //
    // ⚠️ AND IT IS RETURNED, because a reward with no screen is not shipped: a recipe that silently
    // appears in a list of two hundred is a recipe nobody will ever notice they earned. The kill card
    // announces it. See [[reward-with-no-screen-is-not-shipped]].
    const teaches = GROVE_RECIPES.find((r) => r.taughtBy === boss.id) || null;
    let taught = null;
    if (teaches) {
        const row = await db.queryOne(
            `UPDATE mkt_grove_player SET taught = array_append(taught, $2), updated_at = NOW()
              WHERE buyer_id = $1 AND NOT ($2 = ANY(taught)) RETURNING taught`,
            [buyerId, teaches.id],
        ).catch(() => null);
        if (row) taught = { id: teaches.id, name: teaches.name, blurb: teaches.blurb };
    }

    await trackActivity(buyerId, "grove_boss", {
        zone: zoneId, boss: boss.id, hyper: hyper?.id || null, taught: taught?.id || null,
    }).catch(() => {});

    return {
        ok: true,
        boss: { id: boss.id, name: boss.name, art: boss.art },
        parts: stored,
        overflow,
        emblem: got.emblem,
        xp: got.xp,
        newlySeen,
        hyper,
        // Both reported back so the kill card can show them rather than the player discovering a chest in
        // their bag later and not knowing what dropped it.
        chest: got.chest || null,
        merits: got.merits || 0,
        kills: Number(after?.boss_kills) || 1,
        first: Boolean(after?.was_first),
        // The zone this kill just opened, or null if it was already open (a repeat kill, or zone twelve).
        // The dopamine pop is driven off this, which is why it has to be the boss response that carries it.
        unlocked,
        // The recipe this boss just handed over, the first time it does. Null on every repeat kill.
        taught,
        cooldownMs: BOSS_COOLDOWN_MS,
    };
}

/**
 * Forge one piece of boss armour.
 *
 * ⚠️ MERITS ARE TAKEN BY A CONDITIONAL UPDATE, NOT BY READ-THEN-WRITE. "Check you can afford it, then
 * charge" is two statements with a gap, and two taps on a slow connection both walk through that gap and
 * forge two pieces for one price. The UPDATE carries its own `merits >= $2` and RETURNING says whether it
 * actually took anything -- the same shape as the chest open and every other claim in this file.
 *
 * ⚠️ AND THE PARTS ARE TAKEN FIRST. There is no transaction available here (neon() is the HTTP driver, so
 * every query is its own request -- see [[postgres-landmines]]), which means the order of the two debits is
 * the whole of the safety. Parts first: if the merit debit then fails the player is out some parts, which
 * the next kill replaces. Merits first and a failed part debit would hand out a free piece, which nothing
 * replaces. Fail toward the recoverable side.
 */
export async function groveForgeArmour(buyerId, pieceId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const piece = pieceById(String(pieceId || ""));
    if (!piece) return { ok: false, error: "no_piece" };

    const already = await db.queryOne(
        `SELECT 1 FROM mkt_grove_armour WHERE buyer_id = $1 AND piece_id = $2`, [buyerId, piece.id],
    ).catch(() => null);
    if (already) return { ok: false, error: "already_made" };

    // The parts, each conditionally, and each put back if a later one is short.
    const taken = [];
    for (const need of piece.parts) {
        const got = await db.queryOne(
            `UPDATE mkt_grove_item SET qty = qty - $4
              WHERE buyer_id = $1 AND place = $2 AND part_id = $3 AND qty >= $4 RETURNING qty`,
            [buyerId, "pack", need.part, need.n],
        ).catch(() => null);
        if (!got) {
            for (const back of taken) {
                await db.query(
                    `UPDATE mkt_grove_item SET qty = qty + $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2`,
                    [buyerId, back.part, back.n],
                ).catch(() => {});
            }
            return { ok: false, error: "not_enough_parts" };
        }
        taken.push(need);
    }

    const paid = await db.queryOne(
        `UPDATE mkt_grove_player SET merits = merits - $2, updated_at = NOW()
          WHERE buyer_id = $1 AND merits >= $2 RETURNING merits`,
        [buyerId, piece.merits],
    ).catch(() => null);
    if (!paid) {
        for (const back of taken) {
            await db.query(
                `UPDATE mkt_grove_item SET qty = qty + $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2`,
                [buyerId, back.part, back.n],
            ).catch(() => {});
        }
        return { ok: false, error: "not_enough_merits" };
    }

    await db.query(
        `INSERT INTO mkt_grove_armour (buyer_id, piece_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [buyerId, piece.id],
    ).catch(() => {});
    await trackActivity(buyerId, "grove_armour", { piece: piece.id }).catch(() => {});

    return { ok: true, piece: { id: piece.id, name: piece.name, slot: piece.slot, rarity: piece.rarity,
        stats: piece.stats }, meritsLeft: Number(paid.merits) || 0, spent: piece.parts };
}

/**
 * Wear a piece, or take off whatever is in its slot.
 *
 * ⚠️ TAKE OFF THE SLOT FIRST, ALWAYS, EVEN WHEN PUTTING SOMETHING ON. The unique index refuses a second
 * worn piece in a slot (see migration 480), so "wear this" without clearing the slot is a query that throws
 * on exactly the common case -- swapping a crown for a better crown.
 */
export async function groveWearArmour(buyerId, pieceId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const piece = pieceById(String(pieceId || ""));
    if (!piece) return { ok: false, error: "no_piece" };

    const owned = await db.queryOne(
        `SELECT worn FROM mkt_grove_armour WHERE buyer_id = $1 AND piece_id = $2`, [buyerId, piece.id],
    ).catch(() => null);
    if (!owned) return { ok: false, error: "not_owned" };

    // Tapping the piece you are already wearing takes it off, which is how the emblems already behave.
    const takingOff = Boolean(owned.worn);
    await db.query(
        `UPDATE mkt_grove_armour SET worn = false
          WHERE buyer_id = $1 AND worn AND split_part(piece_id, '_', 2) = $2`,
        [buyerId, piece.slot],
    ).catch(() => {});
    if (!takingOff) {
        await db.query(
            `UPDATE mkt_grove_armour SET worn = true WHERE buyer_id = $1 AND piece_id = $2`,
            [buyerId, piece.id],
        ).catch(() => {});
    }
    return { ok: true, worn: !takingOff, slot: piece.slot };
}

export async function groveMove(buyerId, { partId, from, to, qty = 1 } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    if (!GROVE_PARTS[partId] || !["pack", "bank"].includes(from) || !["pack", "bank"].includes(to) || from === to) {
        return { ok: false, error: "bad_move" };
    }
    const p = await playerRow(buyerId);
    const n = Math.max(1, Math.round(Number(qty) || 1));

    // Conditional debit: two taps must not move the same part twice.
    const taken = await db.queryOne(
        `UPDATE mkt_grove_item SET qty = qty - $4 WHERE buyer_id = $1 AND place = $2 AND part_id = $3 AND qty >= $4
         RETURNING qty`, [buyerId, from, partId, n],
    ).catch(() => null);
    if (!taken) return { ok: false, error: "not_enough" };

    const dstSlots = to === "bank" ? (Number(p.bank_slots) || 16) : (Number(p.pack_slots) || 16);
    const dstHeld = await db.query(
        `SELECT part_id FROM mkt_grove_item WHERE buyer_id = $1 AND place = $2 AND qty > 0`, [buyerId, to],
    ).catch(() => []);
    const dstSet = new Set((dstHeld || []).map((r) => r.part_id));
    if (!dstSet.has(partId) && dstSet.size >= dstSlots) {
        // Put it back rather than destroying it.
        await db.query(`UPDATE mkt_grove_item SET qty = qty + $4 WHERE buyer_id = $1 AND place = $2 AND part_id = $3`,
            [buyerId, from, partId, n]).catch(() => {});
        return { ok: false, error: "no_room" };
    }
    await db.query(
        `INSERT INTO mkt_grove_item (buyer_id, place, part_id, qty) VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, place, part_id) DO UPDATE SET qty = mkt_grove_item.qty + $4`,
        [buyerId, to, partId, n],
    ).catch(() => {});
    return { ok: true };
}

/** Craft a discovered recipe. Parts come out of the BAG. */
export async function groveCraft(buyerId, recipeId, { temper = false, act = null, aim = 0.5 } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const recipe = recipeById(recipeId);
    if (!recipe) return { ok: false, error: "no_recipe" };

    const p = await playerRow(buyerId);

    // ⚠️ A RECIPE A BOSS HAS NOT TAUGHT YOU IS NOT A RECIPE YOU HAVE. Checked on the server and not merely
    // hidden on the bench: the workbench filters these out of the list, but a hidden row is a UI decision
    // and this is a rule. Without it the charm for a map you have never finished is one POST away.
    if (recipe.taughtBy && !(p.taught || []).includes(recipe.id)) return { ok: false, error: "not_taught" };

    // ⚠️ ONE-TIME THINGS ARE CHECKED BEFORE ANYTHING IS SPENT. A backpack expansion crafted twice is four
    // slots paid for and four slots given once.
    if (recipe.kind === "pack" && (p.packs_built || []).includes(recipe.id)) return { ok: false, error: "already_built" };
    if (recipe.kind === "bank" && (p.banks_built || []).includes(recipe.id)) return { ok: false, error: "already_built" };
    if (recipe.kind === "plot" && (p.plots_built || []).includes(recipe.id)) return { ok: false, error: "already_built" };
    if (recipe.kind === "tool") {
        const held = await db.queryOne(`SELECT tier FROM mkt_grove_tool WHERE buyer_id = $1 AND slot = $2`,
            [buyerId, recipe.slot]).catch(() => null);
        const have = Number(held?.tier) || 0;
        if (have >= Number(recipe.tier)) return { ok: false, error: "already_built" };
        // ── ⚠️ A RUNG IS CLIMBED FROM THE ONE BELOW IT ───────────────────────────────────────────────
        // Luke: "every tier requires the previous to craft." Without this the ladder is a menu: carry map
        // nine's materials home on your first trip and the tier IX tool is craftable from tier 0, which
        // skips eight rungs, eight maps' worth of grind, and the entire reason the ladder exists.
        //
        // The tool is REMADE rather than replaced — one row per slot holding the tier reached — so the
        // previous tier is spent by being upgraded. There is no tier I rod left over to sell or keep.
        if (have !== Number(recipe.tier) - 1) {
            return { ok: false, error: "needs_previous_tier", need: Number(recipe.tier) - 1, have };
        }
    }

    // Discovery gate: you cannot craft what you have not found.
    const seen = await db.query(`SELECT part_id FROM mkt_grove_seen WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const seenSet = new Set((seen || []).map((r) => r.part_id));
    if (!Object.keys(recipe.parts).every((x) => seenSet.has(x))) return { ok: false, error: "not_discovered" };

    // ⚠️ EVERY PART DEBITED CONDITIONALLY, AND ROLLED BACK IF ANY FAILS. neon() over HTTP has no
    // transactions (see CLAUDE.md), so the rollback is by hand — without it a half-paid craft eats parts and
    // gives nothing.
    // ── ⚠️ TEMPERING IS PAID IN THE SAME DEBIT, NOT IN A SECOND ONE ─────────────────────────────────
    // Two debits means two failure points and a window where the recipe is paid for and the temper is not —
    // on a driver with no transactions, that window is a player who loses sixteen parts and gets nothing.
    // Folding the extra into one cost map means the existing conditional-debit-and-roll-back covers both,
    // and a shortfall anywhere refunds everything exactly as it already did.
    const extra = temper ? (temperCost(recipe) || {}) : {};
    const cost = { ...recipe.parts };
    for (const [part, n] of Object.entries(extra)) cost[part] = (cost[part] || 0) + n;

    const spent = [];
    for (const [part, need] of Object.entries(cost)) {
        const row = await db.queryOne(
            `UPDATE mkt_grove_item SET qty = qty - $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2 AND qty >= $3
             RETURNING qty`, [buyerId, part, need],
        ).catch(() => null);
        if (!row) {
            for (const [backPart, backN] of spent) {
                await db.query(`UPDATE mkt_grove_item SET qty = qty + $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2`,
                    [buyerId, backPart, backN]).catch(() => {});
            }
            return { ok: false, error: "not_enough_parts", missing: part };
        }
        spent.push([part, need]);
    }

    // ── ⚠️ THE ROLL HAPPENS BEFORE THE GRANT NOW, BECAUSE THE GRANT DEPENDS ON IT ───────────────────
    // It used to sit below, after everything had already been handed over, which was fine while only tools
    // rolled -- a tool's quality is written on the tool afterwards. It is not fine now that a band decides
    // how many poultices come out of a batch and how many slots a vault adds: the number has to exist
    // before the INSERT that uses it.
    //
    // ⚠️ ROLLED AGAINST THE LEVEL THE PLAYER HAD BEFORE THIS CRAFT. Reading it after would let the craft
    // that levels you up also benefit from the level it just earned.
    const beforeXp = Number(p.craft_xp) || 0;
    const beforeLevel = craftLevel(beforeXp).level;
    const gained = craftXpFor(recipe);
    // Seeded off the player's own running total rather than the session seed: a craft is not a kill and has
    // no kill index, and a client that could re-roll a bad quality by retrying is a client that never gets
    // a bad quality. The temper flag joins the seed so the two paths cannot collide on one total.
    // ── ⚠️ THE BOARD IS THE ROLL ────────────────────────────────────────────────────────────────────
    // Luke: "Let's make it fun ... 3 interactive steps ... one is just rng, la plinko ball hitting pegs on
    // itd way down. With varying buckets."
    //
    // The quality no longer comes from rollQuality here. It comes from where the ball lands on a board whose
    // five buckets are the five bands, each exactly as wide as its chance at this level, with this temper,
    // after this act. That is not decoration over a number decided elsewhere: the landing IS the number, so
    // the thing the player watched is the thing they were given. See grove-craft-act.js for the two versions
    // of this that were not honest and why.
    //
    // rollQuality is still the game's quality roll — groveRework uses it, and qualityOdds is what the board
    // is cut from — so there is still one curve. What changed is where the dice are thrown.
    //
    // ⚠️ SEEDED ON THE PLAYER'S RUNNING XP, like the roll it replaces. A craft has no kill index, and a
    // client that could retry for a better landing is a client that never gets a bad one. It cannot retry
    // anyway — the parts are already spent by the time this runs — but the seed should not invite it.
    const tidy = clampAct(act);
    // ⚠️ THE AIM IS CLAMPED AND NOTHING ELSE IS DONE WITH IT. It is a number from the client like the skill
    // scores, and like them it cannot buy anything the rack does not already offer: it chooses WHERE on the
    // rack the piece is thrown, and the rack decides the rest. The middle is worth the most and is the
    // hardest to hold, which is the whole of the decision.
    const where = Math.max(0, Math.min(1, Number(aim)));
    const seed = ((beforeXp + 1) * 2654435761) ^ (temper ? 0x9e3779b9 : 0) ^ Math.round(actScore(tidy) * 1e6)
        ^ Math.round(where * 1e5);
    const spans = rackFor(beforeLevel, { temper });
    const scatter = scatterFor(tidy);
    const landing = landingFor(where, scatter, seed);
    const band = bandAt(spans, landing);
    // ⚠️ EVERY KIND ROLLS. This was `recipe.kind === "tool" ? ... : null`, which is the single line that
    // made three crafts in four a vending machine — see craftBonusFor for what each kind does with it.
    const quality = qualityInBand(band, seed);
    const bonus = craftBonusFor(recipe, quality);

    // ── WHAT IT MAKES ───────────────────────────────────────────────────────────────────────────────
    if (recipe.kind === "pack") {
        // ⚠️ bonus.slots IS ADDED TO THE AUTHORED `adds`, not instead of it. The recipe still promises +4;
        // a good roll makes it +5 or +6 and the card says so.
        await db.query(
            `UPDATE mkt_grove_player SET pack_slots = pack_slots + $2, packs_built = array_append(packs_built, $3), updated_at = NOW()
              WHERE buyer_id = $1`, [buyerId, Number(recipe.adds) + bonus.slots, recipe.id],
        ).catch(() => {});
    } else if (recipe.kind === "bank") {
        // ⚠️ 64 IS THE CEILING Luke named. LEAST() rather than a check so no sequence of crafts can pass it
        // — and that includes a Masterwork roll's bonus slots, which go through the same clamp.
        await db.query(
            `UPDATE mkt_grove_player SET bank_slots = LEAST(64, bank_slots + $2), banks_built = array_append(banks_built, $3), updated_at = NOW()
              WHERE buyer_id = $1`, [buyerId, Number(recipe.adds) + bonus.slots, recipe.id],
        ).catch(() => {});
    } else if (recipe.kind === "food") {
        // Into the bag, where it takes a slot like anything else. A good roll is a bigger batch.
        await db.query(
            `INSERT INTO mkt_grove_item (buyer_id, place, part_id, qty) VALUES ($1, 'pack', $2, $3)
             ON CONFLICT (buyer_id, place, part_id) DO UPDATE SET qty = mkt_grove_item.qty + $3`,
            [buyerId, recipe.id, Math.max(1, Number(recipe.makes) || 1) + bonus.extra],
        ).catch(() => {});
    } else if (recipe.kind === "charm") {
        // ⚠️ KEYED ON (charm, quality) SO TWO POTENCIES NEVER MERGE. A Rough and a Masterwork Rootwood
        // Seeking are not two of the same thing, and stacking them into one pile of two would throw away
        // the only reason to make a second one.
        await db.query(
            `INSERT INTO mkt_grove_charm (buyer_id, charm_id, band, qty) VALUES ($1, $2, $3, 1)
             ON CONFLICT (buyer_id, charm_id, band) DO UPDATE SET qty = mkt_grove_charm.qty + 1`,
            [buyerId, recipe.id, bonus.band],
        ).catch(() => {});
    } else if (recipe.kind === "tool") {
        // ⚠️ THE TIER ONLY EVER GOES UP. GREATEST means crafting a tier you already hold, or one below it,
        // cannot quietly downgrade a tool you climbed twenty maps for — and the guard above refuses the
        // craft outright so the parts are not spent on nothing.
        await db.query(
            `INSERT INTO mkt_grove_tool (buyer_id, slot, tier) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, slot) DO UPDATE SET tier = GREATEST(mkt_grove_tool.tier, $3), made_at = NOW()`,
            [buyerId, recipe.slot, Math.max(1, Number(recipe.tier) || 1)],
        ).catch(() => {});
    } else if (recipe.kind === "deco") {
        // ⚠️ THE RECIPE ID *IS* THE DECORATION ID. Both tables were authored to the same key so there is no
        // mapping to keep in agreement; grantDecoration refuses anything that is not in the catalogue, so a
        // typo in either file is a failed craft rather than a part silently eaten.
        await grantDecoration(buyerId, recipe.id, 1, "grove_craft").catch(() => {});
    } else if (recipe.kind === "plot") {
        // Into the farm's own upgrades jsonb, so the farm reads it for free off a row it already loads.
        // ⚠️ LEAST() AT THE CAP, not a read-then-write: two crafts racing must not reach three plots, and
        // this driver has no transactions to lean on. plotCount clamps on the way out as well, so a value
        // that somehow got past this is still only ever worth two.
        await db.query(
            `UPDATE mkt_buyer
                SET farm_upgrades = jsonb_set(
                        COALESCE(farm_upgrades, '{}'::jsonb), '{grove_plots}',
                        to_jsonb(LEAST($2::int, COALESCE((farm_upgrades->>'grove_plots')::int, 0) + 1)))
              WHERE id = $1`,
            [buyerId, GROVE_PLOT_CAP],
        ).catch(() => {});
        await db.query(
            `UPDATE mkt_grove_player SET plots_built = array_append(plots_built, $2), updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, recipe.id],
        ).catch(() => {});
    }

    // ── ⚠️ THE FIRST CRAFT EVER PAYS A CHEST ────────────────────────────────────────────────────────
    // Luke: "little wolf not crafting, we should find a way to guide and condition him."
    //
    // He has 93 Bound Straw, can make 25 recipes and has made none. The reason is not difficulty: it is
    // that a first craft costs three piles of parts and returns a tool whose entire payoff happens in
    // ANOTHER SYSTEM, days later, as a percentage. There is nothing at the end of the first one to tell
    // a player the machine pays out at all.
    //
    // So the first craft, once per account ever, hands back a Mossbound Cache: a real object, visible
    // where it is kept, openable on the spot, that pays merits and a hyper roll. It teaches the loop by
    // completing it rather than by explaining it -- see [[teach-by-showing-not-telling]].
    //
    // ⚠️ ONE CHEST, AND NOTHING ELSE ALONGSIDE IT. A chest handed over next to some other reward makes
    // both of them smaller and neither of them the point. See [[rewards-must-be-scoped]].
    //
    // ⚠️ AND IT IS GATED ON THE CRAFT LOG, NOT ON A FLAG SOMEBODY HAS TO REMEMBER TO SET. The log already
    // records every craft; "has this account ever crafted" is a question it can answer, and a question
    // answered from the real record cannot drift out of step with it.
    let firstCraft = false;
    const everCrafted = await db.queryOne(
        `SELECT 1 AS x FROM mkt_grove_craft_log WHERE buyer_id = $1 LIMIT 1`, [buyerId],
    ).catch(() => ({ x: 1 }));   // on a DB error, assume they have: a wrongly-paid chest is worse than a missed one
    if (!everCrafted) {
        firstCraft = true;
        await db.query(
            `INSERT INTO mkt_grove_chest (buyer_id, tier, qty) VALUES ($1, 'mossbound', 1)
             ON CONFLICT (buyer_id, tier) DO UPDATE
                SET qty = mkt_grove_chest.qty + 1, updated_at = NOW()`,
            [buyerId],
        ).catch(() => {});
    }

    await trackActivity(buyerId, "grove_craft", {
        recipe: recipe.id, kind: recipe.kind, first: firstCraft, quality, temper, band: bonus.band,
    }).catch(() => {});

    // ── ⚠️ THE BAND PAYS MERITS ON THE TWO KINDS THAT HAVE NO "MORE" TO GIVE ────────────────────────
    // A plot is capped at two and a decoration is one object, so a good roll cannot hand over a bigger
    // one. Merits are the Grove's own currency with its own sink (the five boss sets), which keeps the
    // payout inside this system rather than inventing a third plot or minting gold on a kill loop.
    if (bonus.merits > 0) {
        await db.query(`UPDATE mkt_grove_player SET merits = merits + $2, updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, bonus.merits]).catch(() => {});
    }

    // The xp is priced off the recipe's own PART COST, never flat per craft -- a flat award makes the
    // cheapest recipe the fastest ladder, which turns crafting into poultice spam. Food is additionally
    // the worst-paying kind, because it is the one recipe that makes a stack and is meant to be made
    // constantly. ⚠️ TEMPERING PAYS NO EXTRA XP: it is parts spent on odds, not on a bigger craft, and
    // paying the ladder for it would make tempering the fastest way to level rather than a decision.
    const afterRow = await db.queryOne(
        `UPDATE mkt_grove_player SET craft_xp = craft_xp + $2, updated_at = NOW()
          WHERE buyer_id = $1 RETURNING craft_xp`,
        [buyerId, gained],
    ).catch(() => null);
    const afterLevel = craftLevel(Number(afterRow?.craft_xp) || beforeXp + gained);

    // ⚠️ THE QUALITY IS WRITTEN ON THE TOOL, THE BONUS IT IMPLIES IS NOT. Quality is the roll -- a fact
    // about history that no curve change can invalidate -- and what it is worth is computed at read time
    // from tier and quality together. Storing "this rod gives 4.2%" would need a backfill the first time
    // the ladder moved. Same rule as TOOL_PCT_PER_TIER.
    if (recipe.kind === "tool" && quality != null) {
        await db.query(
            `UPDATE mkt_grove_tool SET quality = $3 WHERE buyer_id = $1 AND slot = $2`,
            [buyerId, recipe.slot, quality],
        ).catch(() => {});
    }

    await db.query(
        `INSERT INTO mkt_grove_craft_log (buyer_id, recipe_id, kind, xp, quality)
         VALUES ($1, $2, $3, $4, $5)`,
        [buyerId, recipe.id, recipe.kind, gained, quality],
    ).catch(() => {});

    // ⚠️ WHAT IT COST COMES BACK WITH WHAT IT MADE. The craft used to answer with a name and nothing
    // else, so the screen could say "Made Moss Poultice" and not what had just left the bag -- a
    // system that silently eats sixteen parts and reports four words. The spent array is the exact list
    // the transaction decremented, so the panel can show the trade rather than assert it.
    return {
        ok: true, made: recipe.id, kind: recipe.kind, name: recipe.name,
        // The screen announces this; a chest granted silently is a chest nobody knows they have.
        firstCraft,
        spent: spent.map(([part, n]) => ({ part, n })),
        // ⚠️ THE TOTALS, NOT THE AUTHORED NUMBERS. A card that printed `recipe.makes` after a Masterwork
        // roll would say five while eight landed in the bag — the same class of lie as the tool card that
        // once announced "Rough to Fine" over an unchanged 3%.
        makes: recipe.makes ? Number(recipe.makes) + bonus.extra : null,
        adds: recipe.adds ? Number(recipe.adds) + bonus.slots : null,
        tier: Number(recipe.tier) || null,
        slot: recipe.slot || null,
        // What the band bought on top of the recipe, so the card can show the roll paying for itself.
        bonus,
        tempered: Boolean(temper),
        // ── ⚠️ THE FALL, SENT BACK SO THE SCREEN CAN PLAY IT ────────────────────────────────────────
        // The client is handed the board it was already looking at, the landing the server chose, and a
        // rattle that provably ends on it. It animates the drop it is given rather than running its own
        // physics and reporting where the ball stopped — the same rule as a kill, where the scene plays
        // the fight and the server decides the loot.
        set: {
            spans,
            landing,
            band,
            aim: where,
            scatter,
            path: rattle(landing, seed),
            odds: oddsForAim(spans, where, scatter),
            act: tidy,
            score: actScore(tidy),
        },
        // A charm's whole payoff is its rolled potency; the card has nothing else to show for it.
        charm: recipe.kind === "charm" ? { stat: recipe.stat, value: charmValueOf(recipe.id, quality) } : null,
        // The ladder, reported back so the result card can show the bar moving and say when it levelled.
        craft: {
            xpGained: gained,
            level: afterLevel.level,
            levelled: afterLevel.level > beforeLevel,
            progress: afterLevel.progress,
            intoLevel: afterLevel.intoLevel,
            needForNext: afterLevel.needForNext,
        },
        quality,
        qualityBand: quality == null ? null : qualityBand(quality).id,
    };
}

/**
 * Put a food on the belt, or take it off.
 *
 * Luke: "a way to equip food or potions that auto heal you if you get below 60 percent hp." One belt, one
 * food — choosing WHICH is the decision, and a belt that held all four would not be one.
 */
/**
 * Put something on an empty belt, if there is anything to put on it.
 *
 * ⚠️ THE ONE-SLOT BELT MADE SENSE AND THE EMPTY BELT NEVER DID. Choosing WHICH food is a real decision;
 * choosing whether to carry any is not, and the game was asking players to make it by doing nothing.
 * Measured on the live owner account: thirty-five Moss Poultices in the bag and the belt empty, by the one
 * person who built the feature. If HE never armed it, nobody will -- and everything the belt is for (the
 * only craft that pays inside the Grove, the difference between walking out of a deep zone and being
 * carried out) was switched off for everybody by default.
 *
 * ⚠️ THE WEAKEST FOOD HELD, NEVER THE BEST. This spends an item without being asked, so it must never be
 * able to spend the good one: a Heartwood Draught heals 100% and a player saving it for a boss would come
 * back to find the game had drunk it on a rootrat. The weakest is the one you have most of and miss least,
 * and the player can still pick any of them by hand.
 *
 * ⚠️ AND IT ONLY EVER FILLS AN EMPTY SLOT. A belt the player chose -- including one they deliberately
 * emptied -- is a decision, and a convenience that overrides a decision is a bug. Taking it off stays
 * meaningful because nothing re-arms it until the thing on it runs out.
 */
export async function armBeltIfEmpty(buyerId, player = null) {
    const p = player || await playerRow(buyerId);
    if (p?.belt && GROVE_FOODS[p.belt]) return p.belt;
    const held = await db.query(
        `SELECT part_id, qty FROM mkt_grove_item WHERE buyer_id = $1 AND place = 'pack' AND qty > 0`,
        [buyerId],
    ).catch(() => []);
    const foods = (held || [])
        .filter((r) => GROVE_FOODS[r.part_id])
        .sort((a, b) => (Number(GROVE_FOODS[a.part_id].heals) || 0) - (Number(GROVE_FOODS[b.part_id].heals) || 0));
    if (!foods.length) return null;
    const pick = foods[0].part_id;
    await db.query(`UPDATE mkt_grove_player SET belt = $2, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, pick]).catch(() => {});
    if (p) p.belt = pick;
    return pick;
}

export async function groveBelt(buyerId, foodId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    if (foodId && !GROVE_FOODS[foodId]) return { ok: false, error: "no_food" };
    await playerRow(buyerId);
    await db.query(`UPDATE mkt_grove_player SET belt = $2, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, foodId || null]).catch(() => {});
    return { ok: true, belt: foodId || null };
}

/** Equip or unequip an emblem. Three slots now; three more exist and stay locked. */
export async function groveEquipEmblem(buyerId, { emblemId, slot } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    if (!GROVE_EMBLEMS[emblemId]) return { ok: false, error: "no_emblem" };
    if (slot === null) {
        await db.query(`UPDATE mkt_grove_emblem SET slot = NULL WHERE buyer_id = $1 AND emblem_id = $2`, [buyerId, emblemId]).catch(() => {});
        return { ok: true };
    }
    const n = Number(slot);
    if (!Number.isInteger(n) || n < 0 || n > 2) return { ok: false, error: "slot_locked" };
    // Whatever was in that slot steps out first — the unique index would refuse two in one slot.
    await db.query(`UPDATE mkt_grove_emblem SET slot = NULL WHERE buyer_id = $1 AND slot = $2`, [buyerId, n]).catch(() => {});
    await db.query(`UPDATE mkt_grove_emblem SET slot = $3 WHERE buyer_id = $1 AND emblem_id = $2 AND count > 0`, [buyerId, emblemId, n]).catch(() => {});
    return { ok: true };
}

export { GROVE_RECIPES };


/**
 * Open one Grove chest.
 *
 * ⚠️ THE DECREMENT IS THE GUARD, NOT A READ-THEN-WRITE. "Check you have one, then take one" is two
 * statements with a gap between them, and a player tapping twice on a slow connection walks through that
 * gap and opens a chest they do not have. The UPDATE carries its own `qty > 0` and RETURNING tells us
 * whether it actually took anything -- if no row comes back, there was nothing to open and nothing was
 * paid. Same shape as every other claim in this file.
 *
 * ⚠️ AND IT PAYS INTO THE BAG, WHICH CAN BE FULL. storeParts already owns the slot rule and reports what
 * would not fit; a chest that silently vaporised an overflowing reward would be the worst possible version
 * of a reward. The overflow comes back so the screen can say so.
 */
/**
 * Rework a tool already on the bench: re-roll its quality and KEEP THE BETTER of the two.
 *
 * Luke: "the output should have some rng, and maybe some more layering of improvments."
 *
 * ⚠️ WHY THIS EXISTS AT ALL. A tool's tier only ever goes up and its quality was fixed for ever at the
 * moment it was made, so once a player had crafted the best tier their parts could reach, the workbench had
 * nothing left to want from them. Measured on the live database: five crafts in the game's history, and the
 * player who has gone deepest holds 93 Bound Straw and has never crafted anything. The parts had no sink.
 *
 * ⚠️ IT CAN NEVER MAKE A TOOL WORSE, AND THAT IS NOT GENEROSITY. A re-roll that can downgrade what you
 * already own is a trap: the correct play becomes never pressing the button, and a button whose best use is
 * to leave it alone is worse than no button. Keeping the better of the two makes the cost the only thing
 * being risked, which is a decision a player can actually make.
 *
 * ⚠️ AND IT PAYS NO CRAFTING XP. Crafting a tier is a one-time act -- the tier only goes up, so the ladder
 * is self-limiting. Reworking is not: with a surplus of parts it can be repeated for ever, and paying XP for
 * it would be an uncapped faucet on a loop that already has no daily cap. The reward for a rework is the
 * quality. See [[economy-nerf-measure-daily-total]].
 */
export async function groveRework(buyerId, slot) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const want = String(slot || "");
    if (!want) return { ok: false, error: "no_slot" };

    const tool = await db.queryOne(
        `SELECT slot, tier, quality, reworks FROM mkt_grove_tool WHERE buyer_id = $1 AND slot = $2`,
        [buyerId, want],
    ).catch(() => null);
    if (!tool) return { ok: false, error: "no_tool" };

    const recipe = toolRecipeFor(tool.slot, tool.tier);
    if (!recipe) return { ok: false, error: "no_recipe" };

    // ⚠️ REFUSED AT THE TOP BAND, SO NOBODY SPENDS PARTS ON NOTHING. Quality is a 0-100 score but what it
    // is WORTH is the band it falls in -- a 91 and a 99 are both Pristine and both pay x1.60. Allowing a
    // rework there would take real parts for a change the player cannot see and that does not exist in any
    // number the game shows them.
    const band = qualityBand(Number(tool.quality) || 0);
    if (band?.id === QUALITY_BANDS[0].id) return { ok: false, error: "already_best", band: band.id };

    const cost = reworkCost(recipe);
    if (!cost) return { ok: false, error: "no_cost" };

    const p = await playerRow(buyerId);

    // The same conditional-debit-and-roll-back-by-hand as a craft: neon() over HTTP has no transactions,
    // and a half-paid rework that eats parts and returns nothing is the worst outcome available here.
    const spent = [];
    for (const [part, need] of Object.entries(cost)) {
        const row = await db.queryOne(
            `UPDATE mkt_grove_item SET qty = qty - $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2 AND qty >= $3
             RETURNING qty`, [buyerId, part, need],
        ).catch(() => null);
        if (!row) {
            for (const [backPart, backN] of spent) {
                await db.query(`UPDATE mkt_grove_item SET qty = qty + $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2`,
                    [buyerId, backPart, backN]).catch(() => {});
            }
            return { ok: false, error: "not_enough_parts", missing: part, cost };
        }
        spent.push([part, need]);
    }

    // ⚠️ SEEDED ON THE REWORK COUNT, WHICH IS WHY THE COLUMN EXISTS. A roll derived from state that does not
    // change between attempts hands back the same answer every time; seeded on the counter, every rework is
    // its own draw and a retried request cannot shop for a better one. Same reasoning as the craft's own
    // roll, which rides the player's running XP total.
    const before = Number(tool.quality) || 0;
    const level = craftLevel(Number(p?.craft_xp) || 0).level;
    const rand = (() => {
        let x = ((Number(tool.reworks) + 1) * 2654435761 ^ (before + 1) * 40503 ^ want.length * 97) >>> 0;
        return () => {
            x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
            return x / 4294967296;
        };
    })();
    const rolled = rollQuality(level, rand);
    const after = Math.max(before, rolled);
    // ── ⚠️ "IMPROVED" MEANS THE BAND MOVED, NOT THE SCORE ───────────────────────────────────────────
    // Quality is stored 0-100 but what it is WORTH is the band it falls in -- toolBonusFor multiplies by
    // qualityBand(q).mult and nothing else, so a 0 and a 44 are both Rough and both pay x1.00. The first
    // rework in testing rolled 0 -> 32 and the card proudly announced "Rough -> Rough": a real cost paid,
    // a cheerful arrow drawn, and mechanically nothing had happened. Reporting the score as an improvement
    // is the same class of lie as the tool card that once printed "ore yield 3% -> 3%".
    const bandIndex = (q) => QUALITY_BANDS.findIndex((b) => b.id === qualityBand(q)?.id);
    const improved = bandIndex(after) < bandIndex(before);

    await db.query(
        `UPDATE mkt_grove_tool SET quality = $3, reworks = reworks + 1 WHERE buyer_id = $1 AND slot = $2`,
        [buyerId, want, after],
    ).catch(() => {});
    await trackActivity(buyerId, "grove_rework", {
        slot: want, tier: tool.tier, before, rolled, after, improved,
    }).catch(() => {});

    return {
        ok: true,
        slot: want,
        tier: Number(tool.tier) || 1,
        name: recipe.name,
        // ⚠️ THE ROLL AND THE RESULT ARE BOTH REPORTED, because "you rolled Rough and kept your Fine" is a
        // different and much better story than a screen that silently says Fine again. The player paid for
        // the roll; they are owed the sight of it.
        before, rolled, after,
        improved,
        bandBefore: qualityBand(before)?.id || null,
        bandAfter: qualityBand(after)?.id || null,
        bandRolled: qualityBand(rolled)?.id || null,
        spent: spent.map(([part, n]) => ({ part, n })),
        reworks: Number(tool.reworks) + 1,
    };
}

export async function groveOpenChest(buyerId, tier) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const chest = GROVE_CHESTS[String(tier || "")];
    if (!chest) return { ok: false, error: "no_chest" };

    const took = await db.queryOne(
        `UPDATE mkt_grove_chest SET qty = qty - 1, updated_at = NOW()
          WHERE buyer_id = $1 AND tier = $2 AND qty > 0
          RETURNING qty`,
        [buyerId, chest.id],
    ).catch(() => null);
    if (!took) return { ok: false, error: "none_held" };

    const p = await playerRow(buyerId);
    const emblemRows = await db.query(
        `SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId],
    ).catch(() => []);

    // ⚠️ SEEDED ON THE OPENING, NOT ON A KILL. These are opened from the bag whenever the player likes,
    // long after whatever dropped them -- there is no kill index to share. The index is how many of this
    // tier they have left, which moves every open and cannot be steered by retrying.
    const got = rollGroveChest(chest, Number(p?.seed) || 1, Number(took.qty) + chest.id.length,
        bonusesFrom(emblemRows, p), GROVE_HYPER);

    const { stored, overflow, newlySeen } = await storeParts(buyerId, got.parts, Number(p?.pack_slots) || 16);
    if (got.merits > 0) {
        await db.query(
            `UPDATE mkt_grove_player SET merits = merits + $2, updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, got.merits],
        ).catch(() => {});
    }
    // The thing that makes a chest worth opening rather than a bigger pile of what you have. Same grant
    // path as the boss and the wanderer roll.
    const hyper = got.hyper ? await grantHyper(buyerId, got.hyper, { chest: chest.id }).catch(() => null) : null;

    return {
        ok: true,
        tier: chest.id,
        name: chest.name,
        left: Number(took.qty) || 0,
        parts: stored,
        overflow,
        newlySeen,
        merits: got.merits || 0,
        hyper,
    };
}
