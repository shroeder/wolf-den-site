// ── THE LOOT ROLL — RUN ON BOTH SIDES, TRUSTED ON ONE ────────────────────────────────────────────────────────
// Luke: "Its all enemies and as I described. Its also mostly client side except for maybe the drops because we
// can't let costs get out of hand, we are already cost constrained."
//
// That constraint decides the whole architecture, and this file is the hinge of it.
//
// ── THE COST PROBLEM ─────────────────────────────────────────────────────────────────────────────────────────
// A kill loop is the worst possible shape for server traffic. A ten-minute session is a couple of hundred
// kills; one request per kill is a couple of hundred round trips, and round trips ARE Active CPU — every
// neon() query is its own HTTPS request with its own handshake. That is the meter that actually bills (see
// CLAUDE.md). Per-kill requests would make this the most expensive feature in the game by an order of
// magnitude, for a feature whose entire appeal is that you kill a lot of things.
//
// ── THE ANSWER: A SEED, NOT A CONVERSATION ───────────────────────────────────────────────────────────────────
// The server issues a SEED when you enter a zone. The client runs the whole scene from it — movement, wander,
// combat, telegraphs, and the loot roll below. It can show you exactly what dropped the instant the enemy
// dies, because it is computing the same answer the server will.
//
// On settle, the client sends only WHAT IT KILLED, in order. The server re-runs these same pure functions
// from the same seed and grants what they produce. It never reads a single item the client claims to have —
// so the client cannot invent a drop, only lie about kills, and kills are cheap to bound (see the ceiling in
// the settle route: zone population and the 45s respawn put a hard roof on kills per minute).
//
// This is the pattern the card game already uses: the engine runs in the browser and `verifyWin` replays the
// move log through the same pure engine server-side. Same problem, same shape, already proven here.
//
// ⚠️ SO THIS FILE MUST STAY PURE AND DETERMINISTIC. No Math.random, no Date.now, no db, no server-only. The
// moment anything here is non-deterministic the two sides disagree, and the player watches a part drop and
// then not arrive — which is a worse bug than any amount of latency.

// ── A SMALL, FAST, SEEDABLE PRNG ─────────────────────────────────────────────────────────────────────────────
// mulberry32. Deterministic across engines, which is the only property that matters here — the browser and
// node must produce byte-identical sequences from the same seed.
export function rngFrom(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function next() {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A per-kill stream, derived from the session seed and the kill's index.
 *
 * ⚠️ DERIVED PER KILL, NOT DRAWN FROM ONE RUNNING STREAM. If every kill pulled from a single sequence, the
 * server would have to replay the session in exactly the client's order to land on the same numbers — and one
 * dropped kill, one retry, one reorder would desync every roll after it. Keying the stream on the index makes
 * each kill independently reproducible, so a settle can be verified out of order or in pieces.
 */
export const killRng = (seed, index) => rngFrom(((Number(seed) >>> 0) ^ Math.imul(Number(index) + 1, 0x9E3779B1)) >>> 0);

/** Weighted pick from rows carrying `w`. Returns null for an empty table rather than throwing. */
export function pickWeighted(rows, r) {
    const list = (rows || []).filter((x) => Number(x?.w) > 0);
    if (!list.length) return null;
    const total = list.reduce((s, x) => s + Number(x.w), 0);
    let n = r * total;
    for (const row of list) {
        n -= Number(row.w);
        if (n <= 0) return row;
    }
    return list[list.length - 1];
}

const span = ([lo, hi], r) => Math.round(lo + (hi - lo) * r);

// ── ⚠️ A KILL HAS TO FEEL ROLLED, NOT DEALT ────────────────────────────────────────────────────────────────
// Luke: "am I suprised by rare events drops, or is it super predictable".
//
// It was super predictable, and measurably so. Every enemy in the game drops [1,2], [1,1] or [1,3] of a
// part -- those are the ONLY three amounts that exist across all 84 creatures -- and span() is a flat lerp.
// So twenty consecutive Bristlebacks produce "1x Bristle Hide", "2x Bristle Hide", "1x Split Antler", and
// nothing else, ever. Three outcomes. The player is not watching a roll land; they are watching a number
// they already knew.
//
// This keeps the authored band as the normal case and puts a tail on it:
//
//   ordinary   82%     the band as authored -- still what usually happens, by a mile
//   handful    15%     2-3x the top of the band
//   haul      2.8%     5-7x
//   windfall  0.2%     12-16x, about one kill in five hundred
//
// ⚠️ ONE DRAW, THROUGH A PIECEWISE INVERSE-CDF, NOT FOUR ROLLS. The server replays this seeded stream to
// verify a settle, so THE NUMBER OF r() CALLS PER KILL IS PART OF THE CONTRACT -- spend an extra draw here
// and every roll after it in the same kill lands somewhere else, which is the "watch a drop and then not
// receive it" failure this file's header exists to prevent. Spending exactly one uniform, as span() did,
// keeps both sides in step.
//
// ⚠️ AND IT IS DELIBERATELY NOT span() ITSELF. span() also rolls the Crystal Stag's GOLD, and a 16x tail on
// a [400,900] band is a fourteen-thousand-gold drop. Gold has fourteen faucets already and this feature
// deliberately mints almost none of it. Parts only. See [[gold-mint-rate-lever]].
export const DROP_TAIL = [
    { upTo: 0.820, mult: [1, 1], band: null },
    { upTo: 0.970, mult: [2, 3], band: "handful" },
    { upTo: 0.998, mult: [5, 7], band: "haul" },
    { upTo: 1.000, mult: [12, 16], band: "windfall" },
];

/**
 * A part count: the authored band most of the time, with a fat tail. Spends exactly one draw.
 *
 * Returns { n, band } -- the band comes OUT of the roll rather than being re-derived from the number,
 * because deriving it is guesswork: a "handful" of a [1,2] part can land on 2, which is also an ordinary
 * roll, and a drop that was special but did not get dressed as special is a drop nobody noticed.
 */
export function spanTailed([lo, hi], r) {
    let at = 0;
    for (const t of DROP_TAIL) {
        if (r < t.upTo) {
            // Re-spread the draw inside its own band, so results still vary within a tier rather than
            // every haul landing on the same number.
            const k = (r - at) / Math.max(1e-9, t.upTo - at);
            // ⚠️ A TAIL BAND MULTIPLIES THE TOP OF THE AUTHORED BAND, NOT A RE-SPREAD BASE. Spreading the
            // base across the band first put a "handful" of a [1,2] part at 1 x 2 = 2 -- which is also an
            // ordinary roll of that part, so the loudest thing the tail could produce was a number the
            // player saw every other kill. Filmed as twenty kills with three HANDFUL tags on drops of two.
            // A band that cannot be distinguished from the ordinary case is not a band.
            if (!t.band) return { n: Math.max(1, Math.round(lo + (hi - lo) * k)), band: null };
            // ⚠️ A FLOOR OF 2 ON THE BASE, so a band means the same thing whatever row it came off. Most
            // secondary parts are authored [1,1], where hi is 1 -- multiplying that gave a "handful" of
            // two, which is a number the primary part drops on an ordinary roll every other kill. The
            // band has to be legible without knowing which row produced it.
            const mult = t.mult[0] + (t.mult[1] - t.mult[0]) * k;
            return { n: Math.max(hi + 1, Math.round(Math.max(2, hi) * mult)), band: t.band };
        }
        at = t.upTo;
    }
    return { n: Math.max(1, hi), band: null };
}

/**
 * What one kill produces. The SAME call on both sides of the wire.
 *
 * @param {object} foe     the enemy from grove-catalog (or GROVE_RARE)
 * @param {number} seed    the session seed the server issued
 * @param {number} index   which kill this is in the session
 * @param {object} bonus   emblem-derived multipliers: { rarityFind, emblemFind }
 * @returns {{parts: object, emblem: string|null, gold: number, chest: string|null, xp: number}}
 */
// ── WHAT A KILL IS WORTH ────────────────────────────────────────────────────────────────────────────────────
// Luke: "I think the grove probably gives a little too much EXP, including the bosses and enemies."
//
// It was a lot more than a little, and the reason is that the divisors were set against the creature's HEALTH
// without ever being compared to what anything else in the game pays. Measured against the last seven days of
// mkt_xp_event:
//
//   a rootrat    770 hp / 12  =    64 xp   -- an ARENA WIN pays 67, a fishing catch 66, a mining trip 66
//   deepest foe 1460 hp / 12  =   122 xp
//   Glutmaw   59,000 hp / 40  = 1,475 xp   -- a DELVE RUN pays 225, a raid 287, an xp potion 1,311
//   zone 12  180,000 hp / 40  = 4,500 xp
//
// A rootrat is the cheapest action in the game -- there are fifteen to thirty of them, they replenish every
// forty-five seconds, and they do not fight back in zone one -- and each one paid what winning an arena bout
// pays. That is roughly 77,000 xp an hour in zone one and 146,000 at depth, against the game's top earner
// making 212,438 in a WEEK from everything else combined.
//
// ⚠️ THE BAND TO AIM AT IS THE OTHER REPEATABLE LOOPS, NOT A NUMBER SOMEBODY LIKES. craft_combine pays 9.1
// per event, harvest 11.1, salvage 11.2, a sail wave 13.3, a town duel 17.8. Those are the things a player
// does hundreds of times, which is exactly what a Grove kill is -- and unlike a daily, this loop has no cap
// at all. See [[economy-nerf-measure-daily-total]]: the per-event number only matters through how often it
// can be repeated.
//
// A boss is a different animal: once per zone, behind a kill count and a thirty-minute cooldown. Its peers
// are the delve run (225) and the raid (287), and it should sit above them and scale with depth.
//
// Both are single constants on purpose. If these are still wrong, they are wrong by a multiplier and the fix
// is one number, not a formula.
const XP_PER_FOE_HP = 96;    // 770hp -> 8 xp,  1460hp -> 15 xp
const XP_PER_BOSS_HP = 200;  // 59k   -> 295,   180k   -> 900

import { bossChestChance, bossMerits, chestForZone } from "@/lib/marketplace/grove-forge.js";
import { GROVE_ZONES, wandererHyperChance, safeCredit } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_GEAR, GEAR_CHEST, SET_PIECE, SLOT_SPLIT, gearChanceFor } from "@/lib/marketplace/grove-loot.js";

export function rollKill(foe, seed, index, bonus = {}, zoneN = 0, hyperTable = null) {
    // ⚠️ zoneN AND hyperTable DEFAULT TO OFF, and that is a safety property rather than tidiness. Both
    // sides of the wire have to pass the same arguments or the replay disagrees; defaulting to "no hyper
    // roll" means a caller that has not been updated is merely missing a feature instead of quietly
    // rolling a different stream and handing the player a drop the server then declines.
    const out = { parts: {}, emblem: null, gold: 0, chest: null, xp: 0, band: null, rare: null, hyper: null, gear: null, gearTier: null, setPiece: null };
    if (!foe) return out;
    const r = killRng(seed, index);

    // ── PARTS ───────────────────────────────────────────────────────────────────────────────────────
    const row = pickWeighted(foe.loot, r());
    if (row) {
        const rolled = spanTailed(row.n, r());
        let n = rolled.n;
        // "increased rarity of items found in this feature" — the emblem reads as MORE of the thing, which
        // is the only reading that works on a table where every row is a part rather than a rarity tier.
        const rarity = Number(bonus.rarityFind) || 0;
        if (rarity > 0 && r() < Math.min(0.75, rarity / 100)) n += 1;
        out.parts[row.part] = (out.parts[row.part] || 0) + n;
        // What the scene dresses the drop as. A haul that looks like one root is a haul nobody noticed.
        out.band = rolled.band;
    }

    // ── 1.2 THE RARE ROW ────────────────────────────────────────────────────────────────────────────
    // Luke: "am I rewarded for killing a unique monster".
    //
    // Before this, no. Every creature ran the same machine -- 70% its own part, 30% a neighbour's -- so the
    // names differed and nothing else did, and killing the rarest thing in a zone paid what the first
    // rootrat paid.
    //
    // ⚠️ IT DROPS A PART FROM DEEPER IN THE FOREST RATHER THAN A NEW ITEM, and all three reasons matter:
    //
    //   1. NO NEW ART. A part with no sprite is a broken-image glyph on the floor of every zone (see
    //      [[img-onerror-fires-before-hydration]]), and one new part per creature is 84 new drawings.
    //   2. IT FEEDS DISCOVERY, which is the best idea in the crafting system and the most starved: a
    //      recipe unlocks once you have SEEN its parts, and the deepest player had seen 14 of 148. A
    //      rootrat that occasionally coughs up Elder Heartwood unlocks a recipe many zones early and
    //      tells you what is waiting down there.
    //   3. IT CANNOT BREAK ANYTHING. It is a part that already exists, at a tier you would reach anyway.
    //      One of them is a tease and not a shortcut, because the recipe still wants eight.
    //
    // rareLoot is authored per creature in grove-catalog.js, so each creature's rare drop is ITS rare drop.
    if (foe.rareLoot && r() < (Number(foe.rareChance) || 0) * (1 + (Number(bonus.rarityFind) || 0) / 100)) {
        const rare = foe.rareLoot;
        out.parts[rare.part] = (out.parts[rare.part] || 0) + span(rare.n || [1, 1], r());
        out.rare = rare.part;
    }

    // ── EMBLEM ──────────────────────────────────────────────────────────────────────────────────────
    const emblemChance = (Number(foe.emblemChance) || 0) * (1 + (Number(bonus.emblemFind) || 0) / 100);
    if (foe.emblem && r() < emblemChance) out.emblem = foe.emblem;

    // ── THE RARE SPAWN'S OWN PAYLOAD ────────────────────────────────────────────────────────────────
    // ⚠️ GOLD AND CHESTS ONLY EVER COME FROM HERE. Gold has fourteen faucets already and a kill loop has no
    // natural daily cap; the chest is granted through addChests at the call site rather than by reaching
    // into the chest ROLL, which is a chain where the first match wins and raising one tier steals from gear.
    if (Array.isArray(foe.gold)) out.gold = span(foe.gold, r());
    if (foe.chestChance && r() < foe.chestChance) out.chest = foe.chestTier || "wooden";

    // ── 1.3 THE WOW ─────────────────────────────────────────────────────────────────────────────────
    // The hyper table -- enchant scroll, power scroll, ship upgrade, Mythic Morsel, enshrinement stone --
    // was built, plumbed and granted, and locked entirely behind bosses at about one percent. With nobody
    // fighting bosses, the most exciting thing in the feature had never been seen by anybody at all.
    //
    // So a sliver of it rides ordinary kills: about one in two thousand at the surface, climbing with
    // depth. A handful of times across a long campaign, which is the right rate for the thing you tell
    // somebody about. It costs nothing to build because grantHyper already exists and the boss uses it.
    //
    // ⚠️ GATED TO THE WEAK END BY zoneN, through the same pickHyper the boss uses. A rootrat handing over
    // an enshrinement stone is not a surprise, it is a bug the player assumes they exploited.
    if (zoneN && hyperTable && r() < wandererHyperChance(zoneN) * (1 + (Number(bonus.rarityFind) || 0) / 100)) {
        out.hyper = pickHyper(zoneN, r(), hyperTable);
    }

    // Small, flat, and deliberately boring. Luke: "small amounts of exp are fine."
    // ⚠️ Whoever grants this MUST pass `gold: 0` to awardXp — it pays gold 1:1 with points otherwise, which
    // on a repeatable kill loop is a money printer. See awardxp-gold-tracks-xp-landmine.
    out.xp = Math.max(1, Math.round((foe.hp || 10) / XP_PER_FOE_HP));
    // ── GEAR ────────────────────────────────────────────────────────────────────────────────────────
    // Luke: "gear drops on enemies throughout the entirety of the grove. That way there's something to
    // farm for... every enemy still has a loot table of items that it can drop, manicured so every enemy
    // has something different to drop, but its power is relative to the zone and enemy you're facing."
    //
    // ⚠️ IT IS AN INDEPENDENT ROLL, NOT A ROW IN `foe.loot`. That array is WEIGHTED and sums to a whole:
    // a gear row at w:20 would mean every gear drop is a part that did not drop, and tuning gear up later
    // would silently nerf crafting with nothing in the diff to say so. Same shape as emblemChance and
    // rareChance above, for the same reason. Parts are untouched by anything here.
    //
    // ⚠️ AND IT IS LAST IN THE FUNCTION ON PURPOSE. Every r() call shifts the stream for everything after
    // it, and both sides replay this function from the same seed — so appending at the end leaves parts,
    // the rare row, the emblem, gold, the chest and the hyper byte-identical to what they rolled before
    // gear existed. A session in flight across the deploy sees the same loot it would have seen.
    //
    // The zone is looked up from zoneN rather than passed in, which is what keeps the signature — and
    // therefore the client and the server — unchanged.
    const zone = zoneN ? GROVE_ZONES[zoneN - 1] : null;
    const table = zone && foe?.id ? GROVE_GEAR[`${zone.id}|${foe.id}`] : null;
    if (table) {
        const map = zone.map || 1;
        // "increased rarity of items found in this feature" reads here as MORE OFTEN, the same way it
        // reads on the parts table — the slot split below is what decides how good the piece is.
        const find = 1 + (Number(bonus.rarityFind) || 0) / 100;
        if (r() < gearChanceFor(map) * find) {
            const slot = r();
            if (slot < SLOT_SPLIT.sup) { out.gear = table.sup; out.gearTier = "sup"; }
            else if (slot < SLOT_SPLIT.sup + SLOT_SPLIT.rare) { out.gear = table.rare; out.gearTier = "rare"; }
            else { out.gear = table.normal; out.gearTier = "normal"; }

            // ── THE TAIL ────────────────────────────────────────────────────────────────────────────
            // Luke, on celestial and primordial: "no, it's rare, but possible." They cannot drop as items
            // — every tier above mythic is elite-sourced — so the drop becomes a top-tier CHEST instead,
            // granted through addChests at the call site like the rare spawn's. One place still decides
            // how often elite gear enters the game, and the chest open is already a moment the game
            // celebrates. Deep maps only: this is a frontier reward.
            if (map >= GEAR_CHEST.fromMap) {
                const t = r();
                if (t < GEAR_CHEST.primordial) { out.chest = "primordial"; out.gear = null; out.gearTier = null; }
                else if (t < GEAR_CHEST.primordial + GEAR_CHEST.celestial) { out.chest = "celestial"; out.gear = null; out.gearTier = null; }
            }

            // ── A COLLECTION PIECE ──────────────────────────────────────────────────────────────────
            // Luke: "make it extremely hard to get in the Grove as well." Two a month Den-wide, one per
            // ~39 hours of farming — 2.5% of the flow the game already produces, which makes this the
            // hardest route to a set piece in the game while keeping it possible. Map 5 on, so it cannot
            // be farmed on the on-ramp where the gear rate is three times higher.
            if (map >= SET_PIECE.fromMap && out.gear && r() < SET_PIECE.chance) {
                // ⚠️ IT REPLACES THE PIECE THAT DROPPED, and it picks a REAL id rather than setting a
                // flag — a flag leaves the caller to decide which piece, which is a second place that
                // decides loot and the exact shape that drifts. The pool is emitted into grove-loot.js
                // beside the tables so the client and the server pick the same one from the same seed.
                const pool = SET_PIECE.pool || [];
                if (pool.length) {
                    out.gear = pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))];
                    out.gearTier = "set";
                    out.setPiece = out.gear;
                }
            }
        }
    }

    return out;
}

/**
 * What a BOSS kill produces. A different function rather than a flag on rollKill, because almost nothing about
 * it is the same shape.
 *
 * ⚠️ IT PAYS EVERY LOOT ROW, NOT ONE. That is the whole difference between a boss and the two hundredth
 * rootrat: a wanderer rolls its table and usually gives you the common row, a boss hands over the lot. It is
 * also why boss rows carry no `w` — there is nothing to weight.
 *
 * ⚠️ AND IT PAYS NO GOLD. Bosses are repeatable on a timer, and gold already has fourteen faucets; the Crystal
 * Stag stays the one thing in this feature that mints. Luke: "We dont grant gold."
 *
 * @param {object} boss   the entry from GROVE_BOSSES
 * @param {number} zoneN  which zone it stands at — sets the hyper-rare chance
 * @param {number} seed   the session seed
 * @param {number} index  the kill index, same stream as every other kill
 * @param {object} bonus  emblem-derived { rarityFind, emblemFind }
 */
export function rollBoss(boss, zoneN, seed, index, bonus = {}, hyperChance = 0, hyperTable = null) {
    const out = { parts: {}, emblem: null, hyper: null, xp: 0, chest: null, merits: 0 };
    if (!boss) return out;
    const r = killRng(seed, index);

    const rarity = Number(bonus.rarityFind) || 0;
    for (const row of boss.loot || []) {
        let n = span(row.n, r());
        if (rarity > 0 && r() < Math.min(0.75, rarity / 100)) n += 1;
        out.parts[row.part] = (out.parts[row.part] || 0) + n;
    }

    // The reliable route to an emblem. A wanderer is a fraction of a percent; a boss is roughly one in nine,
    // on a thirty-minute timer. "Emblems are rare" stays true and the player has something to aim AT.
    const em = (Number(boss.emblemChance) || 0) * (1 + (Number(bonus.emblemFind) || 0) / 100);
    if (boss.emblem && r() < em) out.emblem = boss.emblem;

    // ⚠️ THE HYPER ROLL IS DRAWN LAST AND FROM THE SAME STREAM, so the server lands on the same answer the
    // client already showed. It is NOT re-rolled server-side off a fresh seed — that would mean the scene can
    // celebrate a Mythic Morsel the settle then declines to hand over.
    if (r() < (Number(hyperChance) || 0) * (1 + rarity / 100)) {
        out.hyper = pickHyper(zoneN, r(), hyperTable);
    }

    out.xp = Math.max(4, Math.round((boss.hp || 100) / XP_PER_BOSS_HP));

    // ── ⚠️ THE CHEST AND THE MERITS, AND WHY THEY ARE HERE AND NOT IN THE CHEST CHAIN ────────────────
    // Luke: "the boss table has a loot table its got good shot like random chests and stuff, the chests
    // are a parallel chest that have rare crafting goods for the grove."
    //
    // Rolled from the SAME seeded stream as everything else above, so the server re-rolling a claimed
    // boss arrives at the identical answer the client already showed -- which is the whole contract of
    // this file. A chest decided anywhere else would be a second source of truth about one kill.
    //
    // It is a Grove chest, never one of chests.js's eight tiers. Granting through addChests would push
    // Grove parts into the chain that pays Arena gear, where the first match wins and raising one tier
    // steals from the ones beneath it. See [[chest-rolls-are-a-chain]].
    //
    // ⚠️ MERITS ARE FLAT AND NOT ROLLED. The chest is the variance; a standing currency that swung as
    // well would make the thing it buys unpriceable, and merits exist to have exactly one sink.
    const depth = Math.max(1, Number(zoneN) || 1);
    if (r() < bossChestChance(depth)) out.chest = chestForZone(depth).id;
    out.merits = bossMerits(depth);
    return out;
}

/**
 * What a Grove chest pays when it is opened.
 *
 * ⚠️ EVERY ROW IS ROLLED INDEPENDENTLY, NOT AS A WEIGHTED CHAIN. A chest should feel like opening a chest --
 * several things at once -- and an independent roll per row cannot be stolen from by raising a sibling,
 * which is the exact failure the main chest line has and the reason this one is separate at all.
 *
 * Seeded by the chest's own opening, not by a kill: these are opened from the bag at a time of the player's
 * choosing, long after whatever dropped them.
 */
export function rollGroveChest(chest, seed, index, bonus = {}, hyperTable = null) {
    const out = { parts: {}, merits: 0, hyper: null };
    if (!chest) return out;
    const r = killRng(seed, index);
    const rarity = Number(bonus.rarityFind) || 0;
    for (const row of chest.parts || []) {
        if (row.chance != null && r() >= row.chance) continue;
        let n = span(row.n, r());
        if (rarity > 0 && r() < Math.min(0.75, rarity / 100)) n += 1;
        out.parts[row.part] = (out.parts[row.part] || 0) + n;
    }
    out.merits = span(chest.merits, r());

    // ── ⚠️ AND ONE THING THE ZONE CANNOT GIVE YOU ───────────────────────────────────────────────────
    // Luke, reading his own chest contents against his own bag: a Barrowed Casket paid 4-8 Bristle Hide to
    // a player holding 71 of it. Opening it could not feel like anything, and five of them sat unopened in
    // the workbench -- which is the system reporting its own verdict.
    //
    // A chest is not a bigger pile. It is the one place you reliably meet something you cannot farm: the
    // merits above (which buy the boss armour and have exactly one other faucet) and, at a real rate, a
    // roll on the hyper table. hyperFloor is the chest's own depth, so a Mossbound Cache cannot pay an
    // enshrinement stone -- see pickHyper, whose floor fails upward.
    if (hyperTable && chest.hyperChance && r() < chest.hyperChance * (1 + rarity / 100)) {
        out.hyper = pickHyper(chest.hyperFloor || 1, r(), hyperTable);
    }

    return out;
}

/**
 * Which hyper-rare, given the depth it dropped at.
 *
 * ⚠️ THE TABLE IS PASSED IN, NOT IMPORTED — same reason settleKills takes a `lookup`. This module
 * is pure on purpose so the check scripts can run it in bare node, where the "@/" alias does not resolve;
 * one catalogue import would have taken both of them out.
 *
 * ⚠️ THE FLOOR FAILS UPWARD. `minZone` is the shallowest boss allowed to pay a reward, so a deep boss is
 * eligible for everything at or below it rather than only its own rung. A table that matched the rung exactly
 * would hand the hardest kill in the map the narrowest table — the bug this codebase has now hit three times.
 * See ladder-lookups-must-fail-upward.
 */
export function pickHyper(zoneN, r, table) {
    const z = Math.max(1, Number(zoneN) || 1);
    const open = (table || []).filter((h) => z >= (h.minZone || 1));
    if (!open.length) return null;
    const pick = pickWeighted(open, r);
    return pick ? pick.id : null;
}

/** Did the crystal spawn in place of an ordinary enemy? Same seed, same answer on both sides. */
export function rollRareSpawn(baseChance, seed, index, bonus = {}) {
    const r = killRng(seed, index ^ 0x5bf03635);
    const chance = (Number(baseChance) || 0) * (1 + (Number(bonus.rareSpawn) || 0) / 100);
    return r() < chance;
}

/**
 * Settle a whole session. The server calls this with the client's kill list and grants what comes back.
 *
 * ⚠️ IT TAKES IDS AND INDEXES, NEVER ITEMS. The client says "I killed a thornling, and it was kill 41"; it
 * does not get to say what fell out. That is the entire anti-cheat budget of this design and it costs one
 * request instead of two hundred.
 */
// ── ⚠️ A MULTI-KILL ROLLS THE LOOT THAT MANY TIMES ───────────────────────────────────────────────────────────
// Luke: "when you multi-kill an enemy, whether it's 2x, 4x, blah blah blah, like, that should multiply the
// loot drops too for you. So it should drop, it would be as if you killed 4 or 16 or however many your
// multi-kill was of that. It would make that many rolls."
//
// ⚠️ I ARGUED AGAINST THIS AND HE OVERRULED IT, which is the right record to leave: multi-kill originally
// paid progress and nothing else, precisely so drop rate could not scale with gear. It does now. The faucet
// this opens is real and bounded by the same two things that already bound ordinary kills — the rolling kill
// window in grove.js, which counts CLAIMS and is untouched by credit, and safeCredit's cap of eight.
//
// ⚠️ ONE FUNCTION, CALLED BY BOTH SIDES. The scene spills loot the instant a creature falls and the server
// re-rolls the identical answer at settle; two loops over rollKill written in two files is the exact shape
// check-grove-roll exists to catch. See [[atomic-split-into-steps-drops-lines]].
//
// ⚠️ AND THE EXTRA ROLLS NEED THEIR OWN STREAMS. Every roll is keyed on the kill INDEX, so four rolls of one
// kill asking for index `i` four times would return the same drop four times — a multi-kill paying 4x of
// exactly one thing rather than four rolls of the table. The seed is mixed with the roll number instead, and
// roll zero mixes with zero, so a single kill is byte-identical to what it was before this existed.
export function rollKillTimes(foe, seed, index, bonus, zoneN, hyperTable, times = 1) {
    const n = Math.max(1, Math.floor(Number(times) || 1));
    const out = { parts: {}, emblem: null, gold: 0, chest: null, xp: 0, band: null, rare: null, hyper: null,
        chests: [], hypers: [], emblems: {}, gear: null, gearTier: null, gears: [], setPieces: 0 };
    for (let r = 0; r < n; r += 1) {
        const got = rollKill(foe, (Number(seed) || 0) ^ Math.imul(r, 0x85EBCA6B), index, bonus, zoneN, hyperTable);
        for (const [p, c] of Object.entries(got.parts)) out.parts[p] = (out.parts[p] || 0) + c;
        out.gold += got.gold;
        out.xp += got.xp;
        if (got.chest) out.chests.push(got.chest);
        if (got.hyper) out.hypers.push(got.hyper);
        // Gear is collected like chests are — a multi-kill of four bodies rolls the table four times, so
        // four pieces is the honest answer, not one.
        if (got.gear) out.gears.push({ id: got.gear, tier: got.gearTier });
        if (got.setPiece) out.setPieces += 1;
        if (got.emblem) out.emblems[got.emblem] = (out.emblems[got.emblem] || 0) + 1;
        // The FIRST roll is the one the scene draws a band and a rare off — those are presentation for the
        // body that just fell, and there is only ever one body.
        if (r === 0) { out.emblem = got.emblem; out.chest = got.chest; out.band = got.band; out.rare = got.rare; out.hyper = got.hyper; out.gear = got.gear; out.gearTier = got.gearTier; }
    }
    return out;
}

export function settleKills(kills, lookup, seed, bonus = {}, zoneN = 0, hyperTable = null) {
    const parts = {};
    const emblems = {};
    let gold = 0;
    let xp = 0;
    const chests = [];
    // ⚠️ COLLECTED AND RETURNED, OR THE SCENE CELEBRATES SOMETHING THAT NEVER ARRIVES. rollKill can now
    // produce a hyper on an ordinary kill; if settleKills dropped it on the floor the client would show a
    // Power Scroll and the settle would hand over nothing, which is precisely the failure the header of
    // this file is about. The caller grants these through grantHyper, the same function the boss uses --
    // one payout, one path. See [[atomic-split-into-steps-drops-lines]].
    const hypers = [];
    // Same contract as hypers: collected and RETURNED, or the scene spills a sword on the floor and the
    // settle hands over nothing.
    const gears = [];
    let setPieces = 0;
    // ⚠️ WHAT DIED, BY NAME, AND HOW MANY. The loot rolls answer "what did you get"; nothing answered "what
    // did you kill" — and a town hunt ("drown twelve Fen Lurkers") is a question about the second. Counted
    // here rather than re-derived by the caller because the multi-kill credit lives here: a row with c=4 is
    // four creatures, and a caller counting rows would quietly pay a quarter of what it owed.
    const slain = {};

    for (const k of kills || []) {
        const foe = lookup(k.id);
        if (!foe) continue;
        // `c` is the multi-kill credit the scene claimed, rounded down to a rung this rule could have
        // produced and capped — see safeCredit. Absent means one, which is every ordinary kill.
        const got = rollKillTimes(foe, seed, k.i, bonus, zoneN, hyperTable, safeCredit(k?.c));
        for (const [p, n] of Object.entries(got.parts)) parts[p] = (parts[p] || 0) + n;
        for (const [em, n] of Object.entries(got.emblems)) emblems[em] = (emblems[em] || 0) + n;
        gold += got.gold;
        xp += got.xp;
        for (const c of got.chests) chests.push(c);
        for (const h of got.hypers) hypers.push(h);
        for (const g of got.gears) gears.push(g);
        setPieces += got.setPieces || 0;
        slain[k.id] = (slain[k.id] || 0) + Math.max(1, safeCredit(k?.c) || 1);
    }
    return { parts, emblems, gold, xp, chests, hypers, gears, setPieces, slain };
}
