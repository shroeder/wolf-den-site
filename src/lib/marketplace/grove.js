import { groveOpen } from "@/lib/marketplace/owner.js";
import "server-only";
import { itemById } from "@/lib/marketplace/items.js";
import { GROVE_GEAR, SET_PIECE } from "@/lib/marketplace/grove-loot.js";
import { bumpHunts } from "@/lib/marketplace/town-hunts.js";
import { grantItem } from "@/lib/marketplace/inventory.js";

import { db } from "@/lib/db";
import { vendorTier } from "@/lib/marketplace/grove-statues.js";
import { grantStatues, statueState } from "@/lib/marketplace/grove-statue-store.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { qualityBand, QUALITY_BANDS, toolBonusFor, charmValue } from "@/lib/marketplace/grove-forge.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { mint } from "@/lib/marketplace/gold-rate.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { coliseumState } from "@/lib/marketplace/grove-coliseum.js";
import {
    GROVE_ZONES, GROVE_ENEMIES, GROVE_RARE, GROVE_EMBLEMS, GROVE_POP,
    GROVE_FOODS, GROVE_CHARMS, HEAL_AT, emblemStars, groveZone,
    GROVE_BOSSES, GROVE_HYPER, BOSS_COOLDOWN_MS, bossHyperChance, groveBoss as bossById, safeCredit,
} from "@/lib/marketplace/grove-catalog.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { petBiteShare } from "@/lib/marketplace/grove-world.js";
import { pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { settleKills, rollBoss } from "@/lib/marketplace/grove-roll.js";
import { bumpBar, barState } from "@/lib/marketplace/grove-bar.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { groveFighter } from "@/lib/marketplace/grove-kit.js";
import { grantStone } from "@/lib/marketplace/pet-ascension.js";
// ⚠️ TOOL_SLOTS IS ALL THAT IS STILL WANTED FROM grove-recipes.js. It is the list of the twelve slots
// and what each one serves, which toolMeta still needs to describe a tool somebody owns.
import { TOOL_SLOTS } from "@/lib/marketplace/grove-recipes.js";

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
// Defined in owner.js so the town can ask it too without an import cycle; re-exported here
// because eight callers already import it from this file.
// ⚠️ IMPORTED AND THEN EXPORTED, NOT `export ... from`. A bare re-export forwards the name without
// creating a local binding, and this file calls groveOpen itself in three places — which compiled
// clean and failed only under lint:undef.
export { groveOpen };

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
// Generous on purpose: a laggy phone settling ninety seconds of play in one burst must never be punished for
// it. This stops a thousand-kill claim, not a fast player.
//
// ⚠️ RAISED FROM 3 TO 6 WHEN CLEARED ZONES STARTED REFILLING AT ONCE. The window below counts respawn
// windows, which WAS the physical roof: a zone dripped one body every 1.5s, so ~40 kills a minute was all
// anyone could physically do and 3x slack sat miles above it. Luke: "players shouldn't have to wait for
// respawns — if they clear the map it should respawn all." That is now true, so kills are bounded by how
// fast a zone can be CLEARED, not by how fast it refills, and the old 3x no longer represented the same
// multiple of reality. Left un-raised, the first thing to break would have been a fast player on a long dive
// having legitimate kills rejected — which reads as the Grove eating your loot.
const KILL_CEILING_SLACK = 6;
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
    // ⚠️ EVERY KEY HERE MUST BE READ SOMEWHERE. These are the drop-side card effects; the combat-side ones
    // go through addGroveStat in grove-kit.js instead. A key added here and nowhere else is a card that
    // silently does nothing, which is the one failure a collectible cannot survive.
    const out = {
        rarityFind: 0, emblemFind: 0, rareSpawn: 0,
        hyperFind: 0, goldFind: 0, xpFind: 0, overkill: 0,
        // ── ✂️ partYield AND salvage ARE GONE, 2026-11-08 ───────────────────────────────────────
        // Both were read by the parts roll and by nothing else, so deleting parts left them as exactly
        // what the rule above forbids: keys in this bag with no reader. The two cards that granted them
        // were re-pointed in grove-maps.js rather than left dead — see the notes on the Wrack Mark
        // (live, members hold it) and the Geared Mark (map 8, unbuilt).
        // ⚠️ NOT A BONUS, A GATE. It rides in this bag because the bag is already the one thing the roll
        // receives about the player, and threading a second argument through every caller of rollKill to
        // carry one integer would be a worse trade. rarityWeights reads it; nothing adds to it.
        vendorTier: vendorTier(Number(player?.unlocked_n) ? Math.ceil(Number(player.unlocked_n) / 12) : 0),
    };
    const charmId = player?.charm_id;
    if (charmId && GROVE_CHARMS[charmId]) {
        const stat = GROVE_CHARMS[charmId].stat;
        if (stat in out) out[stat] += charmValue(charmId, player.charm_band);
    }
    for (const r of emblemRows || []) {
        const meta = GROVE_EMBLEMS[r.emblem_id];
        // ── ⚠️ OWNING IT IS WEARING IT, AS OF 2026-10-30 ────────────────────────────────────────────
        // Luke: "I think I want to do away with equipping monster cards entirely. And just when you
        // possess them, you get the bonus for all... and the level it's at, that you get that bonus at
        // all times."
        //
        // This line was `if (r.slot === null) continue` — only the three worn cards counted. A hundred
        // and three collectibles and a player could feel three of them, so every card after the third
        // was a number on a shelf. Possession pays now.
        //
        // ⚠️ THE `slot` COLUMN STAYS AND NOTHING READS IT. Same rule as the backpack columns: dropping
        // it loses the record of what people had worn, and it costs nothing to leave. If equipping ever
        // comes back it comes back as a NEW idea, not by un-commenting this.
        if (!meta) continue;
        // ⚠️ THE ID DECIDES THE LADDER -- boss cards max at sixteen, not 250. See BOSS_STARS.
        const { stars } = emblemStars(r.count, r.emblem_id);
        if (!stars) continue;
        const v = Number(meta.per) * stars;
        if (meta.stat === "rarity_find") out.rarityFind += v;
        else if (meta.stat === "emblem_find") out.emblemFind += v;
        else if (meta.stat === "rare_spawn") out.rareSpawn += v;
        else if (meta.stat === "hyper_find") out.hyperFind += v;
        else if (meta.stat === "gold_find") out.goldFind += v;
        else if (meta.stat === "xp_find") out.xpFind += v;
        else if (meta.stat === "overkill") out.overkill += v;
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
    // ── ⚠️ THE PET'S ART IS PICKED BY ITS LEVEL, LIKE EVERYWHERE ELSE ───────────────────────────────
    // Luke: "I think my ladybug is not level 1. The sprite for it is level like 4, so I don't know why
    // it's showing the level 1 sprite for my pet in the grove."
    //
    // Because this read `ps.url` — the row in mkt_pet_sprite, which is the Lv1 BASE — and stopped there.
    // Every other screen in the game (the boss, the town, sailing, a profile, the card art) goes through
    // pickPetSpriteForLevel; the Grove was the only caller that did not, so a level-six companion walked
    // into a zone wearing the form it hatched in. PettingStand carries a comment warning about exactly
    // this class of mistake, one layer up.
    //
    // ⚠️ STILL ONE ROUND TRIP. The evolved sprites, the chosen look and the enshrinement stone all join
    // the query that was already being run rather than arriving as three more — round trips are the meter
    // that bills, see CLAUDE.md. json_agg because a pet has up to six rungs and they are rows, not columns.
    //
    // ⚠️ ::text ON BOTH SIDES OF THE ENSHRINED JOIN. mkt_pet_enshrined.buyer_id is TEXT and mkt_buyer.id is
    // UUID, and joining them raw is "operator does not exist" — which db.queryOne swallows, and the whole
    // hero would quietly come back null. Exactly the trap cards.js documents at its own version of this.
    const row = await db.queryOne(
        `SELECT b.avatar_sprite_url AS hero, ps.url AS pet, ps.flip AS pet_flip,
                b.featured_collectible AS pet_id,
                COALESCE(pl.xp, 0) AS pet_xp, pl.look_level AS pet_look, e.stone AS pet_stone,
                COALESCE((
                    SELECT json_agg(json_build_object('level', sl.level, 'variant', sl.variant,
                                                      'url', sl.url, 'flip', sl.flip))
                      FROM mkt_pet_sprite_level sl
                     WHERE sl.pet_id = b.featured_collectible AND sl.url IS NOT NULL
                ), '[]'::json) AS pet_levels
           FROM mkt_buyer b
           LEFT JOIN mkt_pet_sprite ps ON ps.pet_id = b.featured_collectible
           LEFT JOIN mkt_pet_level pl ON pl.buyer_id = b.id::text AND pl.pet_id = b.featured_collectible
           LEFT JOIN mkt_pet_enshrined e ON e.buyer_id::text = b.id::text AND e.pet_id = b.featured_collectible
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
    // The level map in the shape pickPetSpriteForLevel wants: a rung keys on its number, and level six keys
    // as "6:light" / "6:dark" because which stone was spent is written on the animal for the rest of its life.
    const levelMap = {};
    for (const r of row?.pet_levels || []) {
        levelMap[r.variant ? `${r.level}:${r.variant}` : String(r.level)] = { url: r.url, flip: r.flip === true };
    }
    const petPick = pet
        ? pickPetSpriteForLevel(row?.pet ? { url: row.pet, flip: row.pet_flip === true } : null,
            levelMap, petLevel, row?.pet_stone || null, row?.pet_look || null)
        : null;
    return {
        heroArt: row?.hero || null,
        petArt: petPick?.url || row?.pet || null,
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

    const [p, zones, items, emblems, tools, charms, look, hero] = await Promise.all([
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
        db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT slot, tier, quality, reworks FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        // ✂️ TWO QUERIES WERE HERE: the last twelve crafts for the history panel, and every recipe ever
        // made for the dock badge. Both read mkt_grove_craft_log, which nothing writes any more.
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
    // ⚠️ FOOD IS ALL THAT IS LEFT IN mkt_grove_item, BUT IT IS STILL FILTERED BY IDENTITY. The old part
    // rows are deliberately not deleted (see the note where storeParts used to be), so this table still
    // returns them and a reader that trusted the table to hold only food would put a Gnawed Root on the
    // belt. GROVE_FOODS stays the gate.
    const food = {};
    for (const r of items || []) {
        if (GROVE_FOODS[r.part_id]) food[r.part_id] = Number(r.qty);
    }

    return {
        ok: true,
        ...look,
        hero,
        // ✂️ `quests` WAS HERE — the hub's copy of the quest board. Removed 2026-11-08 with the givers.
        unlockedN: Number(p?.unlocked_n) || 1,
        // ⚠️ THE COLUMNS STAY, THE CONCEPT GOES. pack_slots / bank_slots / packs_built / banks_built are
        // still on the row because dropping columns is how you lose the record of what somebody crafted
        // before the rule changed; nothing reads them any more. See storeParts.
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

        // ✂️ THE `craft` BLOCK WAS HERE: the crafting level, the band odds at that level, and the last
        // twelve things made. craft_xp stays on the row — nothing earns it now, and it is the record of
        // how far somebody got — but a level with no ladder under it is not worth sending to a screen.
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
        // ✂️ seen, tablet, recipes, taught AND made WERE ALL HERE, and all five were about the bench.
        //
        // ⚠️ THE TABLET WENT WITH THEM, AND IT WAS NEVER WIRED ANYWAY. It reported "you have seen 14 of
        // 16 materials" and a list of bonuses from tabletBonuses — and tabletBonuses was read HERE AND
        // NOWHERE ELSE. The breakpoints in TABLET_BREAKS ("Well travelled", +3% rarity_find) were shown
        // to players as earned bonuses and never reached the roll: a [[declared-but-never-read]] of the
        // purest kind, live for the whole life of the feature. It is being deleted rather than fixed
        // because its subject is being deleted — but it is worth knowing it was never real.
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
            ...emblemStars(Number(e.count), e.emblem_id), meta: GROVE_EMBLEMS[e.emblem_id] || null,
        })),
        bonuses: bonusesFrom(emblems, p),
        // ⚠️ READ IN THE SAME ROUND TRIP AS EVERYTHING ELSE. A separate /statues fetch would be two more
        // HTTPS requests per panel open on a driver where every query is its own handshake -- see CLAUDE.md
        // on Active CPU. It is two small queries and it rides along.
        statues: await statueState(buyerId, Math.ceil((Number(p?.unlocked_n) || 1) / 12)),
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

    // ── ⚠️ THE SPRITES FOR WHAT THIS ZONE CAN DROP, SENT WITH THE SESSION ───────────────────────────
    // Luke: "when items drop, like loot, does the actual sprite drop for it? If not, please make it do
    // that."
    //
    // It did not. Parts and emblems spilled on the ground with their art; GEAR was granted silently at
    // settle, so a player killed something, got a sword, and saw nothing fall. A reward nobody watches
    // land is a reward nobody knows they got.
    //
    // The scene cannot look a sprite up — it has no database and must not make a request per kill, which
    // is the whole architecture of this feature. So the art rides the session: a zone has at most two
    // residents and each has three slots, so this is SIX rows, once, on a request that was already
    // happening. Nothing per kill, nothing per drop.
    const gearIds = [...new Set([
        ...(zone.enemies || []).flatMap((fid) => {
            const row = GROVE_GEAR[`${zone.id}|${fid}`];
            return row ? [row.normal, row.rare, row.sup].filter(Boolean) : [];
        }),
        // ⚠️ AND THE SET POOL, ONCE THE DEPTH CAN ROLL ONE. A set piece does NOT come from the creature's
        // table — rollKill replaces the gear with a draw from the 71-piece pool — so sizing this list off
        // the table alone would leave the single rarest drop in the feature with no art, and a drop with
        // no art spills nothing at all. The rarest thing in the Grove would be the one thing you never
        // see land. Only below the depth that can roll it, so the on-ramp payload stays at six rows.
        ...((zone.map || 0) >= SET_PIECE.fromMap ? SET_PIECE.pool : []),
    ])];
    const gearArt = gearIds.length
        ? Object.fromEntries((await db.query(
            `SELECT item_id AS k, url FROM mkt_item_sprite WHERE item_id = ANY($1)`, [gearIds],
        ).catch(() => [])).map((r) => [r.k, { url: r.url, name: itemById(r.k)?.name || r.k }]))
        : {};

    // ── ✂️ THE QUEST BOARD AND THE GIVER IN THIS ZONE WERE BOTH HERE ────────────────────────────────
    // Luke, 2026-11-08: "Remove all quest givers and quests."
    //
    // `quests` was one read of mkt_grove_quest riding the session, and `npcHere` was which of the three
    // givers hidden across this map's twelve zones was standing in THIS one — the thing the scene drew a
    // figure for. The marshal was deliberately excluded from that match so he was not painted twice; he
    // is the one person left in the forest, and he is still reached by tapping the Coliseum.
    const coliseum = await coliseumState(buyerId, zone.map || 1).catch(() => null);

    return {
        ok: true,
        seed,
        gearArt,
        // ⚠️ READ ON ENTER, NOT POLLED. The meter moves off the settle's own response for the whole visit
        // (see `bar` there); this is the starting value, so a player walking into a zone sees where the bar
        // already stood rather than watching it animate up from zero.
        bar: await barState(buyerId, Number(zone?.map) || 1).catch(() => null),
        coliseum,
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

// ── ✂️ storeParts IS GONE, AND WITH IT THE BACKPACK ─────────────────────────────────
// It owned three things: the sixteen-row slot cap, the `overflow` report for what would not fit, and the
// permanent seen-set that unlocked recipes. All three were about parts and nothing else.
//
// ⚠️ mkt_grove_item AND mkt_grove_seen ARE NOT DROPPED. Food still lives in mkt_grove_item — it always
// shared the table, split out by identity rather than by column — and mkt_grove_seen is the record of what
// every member ever found. Same rule as pack_slots and banks_built: dropping a column or a table is how you
// lose the evidence of what somebody did before the rule changed.
//
// ⚠️ THE PART ROWS ARE LEFT IN PLACE RATHER THAN DELETED. Nothing reads them, they cost nothing to keep,
// and whoever answers item R may well want to know what people were carrying when the bench closed.

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

    // ── ⚠️ THE TOWN HUNTS TICK HERE, OFF THE SAME TALLY THE LOOT CAME FROM ──────────────────────────
    // settleKills now reports `slain` — what died, by name, with the multi-kill credit already folded in.
    // Hooking the hunt here rather than in the scene means it cannot be inflated by a client: the same list
    // that decides what loot you get decides what your hunt counts, and the server has already bounded it
    // (zone membership, the rolling kill ceiling). A second count taken anywhere else would be a second
    // thing to keep honest.
    //
    // Not awaited into the response path beyond this line and failure-tolerant by design: a hunt that misses
    // a tick is a quest that takes slightly longer, while a settle that throws is loot a member watched drop
    // and never received.
    await bumpHunts(buyerId, got.slain, Number(zone?.map) || 0).catch(() => {});


    // ── ✂️ THE QUEST TICK WAS HERE, AND ITS STORY IS WORTH KEEPING ──────────────────────────────────
    // bumpQuests shipped with the chains, was exported, and was imported by NOTHING for the whole life of
    // the feature: every bar on the quest board sat at an honest 0 forever and nothing errored. It was
    // eventually wired in right here, beside the town hunts, so that the same server-side tally that
    // decided loot decided quest progress and a client could not inflate it.
    //
    // Kept as a comment because it is the clearest example in this file of [[declared-but-never-read]] —
    // a whole subsystem that rendered, looked healthy, and did nothing.

    // ── STATUES ─────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ GRANTED, NOT APPLIED. A statue does nothing until it is poured into a line -- see turnInStatue.
    // This only puts it on the shelf, which is why a settle cannot change anybody's stats.
    if (got.statues?.length) await grantStatues(buyerId, got.statues).catch(() => {});

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
    // ⚠️ THE RARE SPAWN PAID A CHEST HERE. Chests are removed from the Grove; the rare spawn still
    // pays its own loot row, which is the part players could actually see.

    // ── GEAR ────────────────────────────────────────────────────────────────────────────────────────
    // Luke: "gear drops on enemies throughout the entirety of the grove. That way there's something to
    // farm for."
    //
    // ⚠️ THROUGH grantItem, THE FUNCTION EVERY OTHER SOURCE USES. The chest, the delve, the raid and
    // fishing all hand gear over the same way; a second INSERT here would be a second path for one
    // payout, which this repo has paid for twice already. `via` is "grove" so the ledger can tell the
    // Grove's contribution from the chests' — which is the number the faucet gets re-measured on.
    const gearGot = [];
    for (const g of got.gears || []) {
        if (!g?.id) continue;
        const ok = await grantItem(buyerId, g.id, "grove").catch(() => null);
        // ⚠️ THE NAME AND THE RARITY COME FROM THE CATALOGUE, NOT THE ROLL. The roll carries an id and a
        // tier band ("sup"/"rare"/"normal"), which is what the TABLE called the slot — not what the item
        // is. A card reading "grove_sup" is a card nobody can read.
        if (ok !== null) {
            const it = itemById(g.id);
            gearGot.push({
                id: g.id,
                name: it?.name || g.id,
                rarity: it?.rarity || null,
                slot: it?.slot || null,
                icon: it?.icon || null,
                tier: g.tier || null,
            });
        }
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
    // ⚠️ CREDIT, NOT BODIES — AND ONLY HERE. A blow that overkilled by four times counts as four kills
    // toward opening the zone and as ONE kill everywhere else: one loot roll (settleKills above walked
    // `list`, which is untouched), one shot at a rare, one chest chance, one lot of XP, and one entry
    // against the rolling window below. Luke asked for multi-kill against the kill REQUIREMENT, and
    // letting it reach the loot would have made overkill a drop-rate multiplier that scales with gear.
    //
    // safeCredit rounds each claim down to a rung this rule could actually have produced and caps it, so
    // the client cannot invent a number. See killCredit in grove-catalog.js for why that is the right
    // amount of checking given the server does not simulate combat.
    const credited = list.reduce((n, k) => n + safeCredit(k?.c), 0);
    const z = await db.queryOne(
        `INSERT INTO mkt_grove_zone (buyer_id, zone_id, kills) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, zone_id) DO UPDATE SET kills = mkt_grove_zone.kills + $3
         RETURNING kills`,
        [buyerId, zoneId, credited],
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

    // ── ⚠️ THE KILL BAR, WHICH IS WHERE TOOLS COME FROM NOW ─────────────────────────────────────────
    // Luke, 2026-11-08: "You kill enemies in an area. A bar fills... The reward is each crafting tool of
    // that zone tier... Once you have all tools. It becomes a low level chest."
    //
    // ⚠️ IT TICKS ON `list.length`, THE CLAMPED COUNT — never `kills.length`, what the client claimed. The
    // list has already been through the window ceiling above, which is the only thing standing between a
    // tampered kill count and a chest printer. See the note on BAR_MAX_FILLS.
    //
    // ⚠️ AND IT IS KEYED ON THE ZONE'S MAP, not the zone. A tool's tier IS its map, so the bar has to
    // belong to the map or walking through a gate would reset it.
    //
    // Failure-tolerant like the hunts and the belt: a bar that misses a tick is a reward that arrives a
    // little later, while a throw here is a settle that fails and loses loot somebody watched drop.
    const bar = await bumpBar(buyerId, Number(zone?.map) || Math.ceil(zoneN / 12) || 1, list.length)
        .catch(() => null);

    // ⚠️ RE-ARMED AFTER THE FOOD IS DEBITED, NOT BEFORE. The belt empties mid-dive, and a player who
    // crafted two kinds of poultice should carry on healing rather than discover at the bottom of a zone
    // that the slot went empty forty kills ago. armBeltIfEmpty only fills an empty slot, so this is a
    // no-op on every settle where there is still something to eat. The client picks it up on its refresh.
    const beltNow = await armBeltIfEmpty(buyerId).catch(() => null);

    return {
        ok: true,
        // ✂️ `parts` and `overflow` were here. The bag cannot overflow any more because the only thing
        // that filled it was parts; food is capped per row, not per slot.
        belt: beltNow,
        emblems: got.emblems,
        gold: got.gold,
        // Named in the response so the screen can say what arrived. The scene already celebrated it on the
        // kill; a reward announced in the world but missing from the receipt is half a reward.
        // See [[reward-with-no-screen-is-not-shipped]].
        hypers,
        // ── ⚠️ THE GEAR, SAID OUT LOUD — IT WAS GRANTED AND NEVER MENTIONED ──────────
        // Luke: "Playing the grove should drop gear. We designed this but never implemented it."
        //
        // It WAS implemented, everywhere except the one place a player could tell. The roll made it
        // (grove-roll.js), the grant banked it through grantItem exactly like every other source,
        // and then gearGot was pushed into a local array that nothing ever read. So a drop at
        // one-in-forty arrived in the bag silently: no label in the world, no line on the receipt,
        // no card. From the player's side the feature did not exist, which is what was reported.
        // [[declared-but-never-read]] and [[reward-with-no-screen-is-not-shipped]].
        gear: gearGot,
        xp: got.xp,
        // ── ⚠️ THE BAR AND WHAT IT PAID, ON THE RECEIPT ─────────────────────────────────────────────
        // `bar` carries the new progress so the meter in the scene moves without a second request, and
        // `bar.paid` is every reward this settle crossed, in order. A reward granted and not announced is
        // the bug that hid the Coliseum's dead gear for months — [[reward-with-no-screen-is-not-shipped]].
        bar,
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
    // ⚠️ A BOSS BANKED A GROVE CHEST HERE, and a flat merit stipend below it. Both gone with the
    // systems they fed.
    // ⚠️ MERITS ARE NOT GOLD AND MUST NEVER TOUCH awardXp. awardXp pays gold 1:1 with points unless told
    // otherwise, which is the landmine two lines above this one; merits are their own column with one
    // faucet (this) and one sink (the boss sets). See [[awardxp-gold-tracks-xp-landmine]].

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
    // ✂️ THE BOSS NO LONGER TEACHES A CHARM RECIPE, 2026-11-08.
    //
    // `taughtBy` was the one EARNED row on a bench of two hundred always-visible ones, and the charm it
    // unlocked is now uncraftable — so announcing "you learned Rootwood Seeking" on the kill card would
    // be a reward screen for a thing the player cannot then go and do. That is worse than silence.
    //
    // ⚠️ THE `taught` COLUMN STAYS AND IS NOT CLEARED. Same rule as pack_slots and banks_built: dropping
    // a column is how you lose the record of what somebody earned before the rule changed. Whoever answers
    // item R wants to know which bosses a member has already beaten, and this array is that record.

    await trackActivity(buyerId, "grove_boss", {
        zone: zoneId, boss: boss.id, hyper: hyper?.id || null,
    }).catch(() => {});

    return {
        ok: true,
        boss: { id: boss.id, name: boss.name, art: boss.art },
        // ✂️ parts, overflow and newlySeen were here. A boss paid every row of its loot table at once,
        // which was the entire difference between it and a wanderer; what is left is the emblem it is the
        // only source of, the hyper sliver, and the zone it opens. Luke, asked what a boss should pay
        // instead: "Nothing." The reward is openTheWay.
        emblem: got.emblem,
        xp: got.xp,
        hyper,
        // Both reported back so the kill card can show them rather than the player discovering a chest in
        // their bag later and not knowing what dropped it.
        kills: Number(after?.boss_kills) || 1,
        first: Boolean(after?.was_first),
        // The zone this kill just opened, or null if it was already open (a repeat kill, or zone twelve).
        // The dopamine pop is driven off this, which is why it has to be the boss response that carries it.
        unlocked,
        cooldownMs: BOSS_COOLDOWN_MS,
    };
}



// ── ✂️ groveMove IS GONE ────────────────────────────────────────────────────────────
// Moving a part between the bag and the bank. The bank itself was removed in October; this was the last
// thing that still spoke to it, and the only objects it could ever move were parts.

// ── ✂️ groveCraft IS GONE — THE WHOLE BENCH, 2026-11-08 ─────────────────────────────
// Luke: "I think we remove monster part items, remove crafting all together."
//
// This was the largest function in the file: the taught-gate, the one-off guards for plots and tools, the
// "every tier requires the previous" ladder rule, the part debit, the quality roll, the craft-xp award and
// six per-kind grants (pack, bank, food, charm, tool, deco).
//
// ⚠️ WHAT IT WAS THE ONLY WRITER OF, SO THE NEXT PERSON DOES NOT HAVE TO FIND OUT THE HARD WAY:
//   · mkt_grove_tool       — the twelve systems that read groveToolPct now see only what members already hold
//   · mkt_grove_charm       · mkt_grove_craft_log       · the food rows in mkt_grove_item
//   · plots_built           · the three source:"grove" decorations in decorations.js
// Every one of those is an acquisition gap logged as item R in docs/grove-feedback-backlog.md. The reader
// side of all of it is deliberately untouched: a tool a member owns still pays, a charm still burns on
// entry, a food still rides the belt.
//
// ⚠️ DO NOT RESURRECT THIS FROM GIT TO "FIX" AN UNOBTAINABLE TOOL. Item R is a design question with three
// candidate answers and Luke parked it; re-adding a bench is not one of them. The code is at HEAD~1.

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

// ── ⚠️ groveEquipEmblem IS GONE ─────────────────────────────────────────────────────────────────────────────
// It set a `slot` column that bonusesFrom stopped reading on 2026-10-30, when owning a card became wearing
// it. The verb survived the mechanic by four days, and with it a Wear button that wrote to the database and
// changed nothing a player could feel. Luke: "The whole idea of wearing them and unwearing them is stupid."
//
// ⚠️ THE COLUMN STAYS. Same rule as the backpack columns and as the note in bonusesFrom: dropping it loses
// the record of what people had worn, and it costs nothing to leave. If equipping ever returns it returns as
// a NEW idea, not by restoring this.

// ✂️ `export { GROVE_RECIPES }` was here, re-exported for GroveBench and GroveToolSheet.


// ── ✂️ groveCraftMany IS GONE ───────────────────────────────────────────────────────
// The batch craft — "Craft N" against one performance of the act, with the stepper that shipped as item 14
// of the feedback backlog. It looped groveCraft, so it died with it.

// ── ✂️ groveRework IS GONE ──────────────────────────────────────────────────────────
// Re-rolling a tool's quality and keeping the better of the two, paid for in parts. The tool KEEPS its
// quality and its rework count — toolBonusFor still reads both, so a reworked tool goes on being worth what
// it was worth. There is simply no longer a way to pay for another roll.

