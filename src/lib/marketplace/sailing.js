import "server-only";

import { db } from "@/lib/db";
import { addChests, CHEST_TIERS, CHEST_ORDER } from "@/lib/marketplace/chests.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";

// Fragments you dig up on the island fuse into a loot chest — now TIERED, one shard type per chest tier.
// 10 shards of a tier forge THAT tier's chest. Each shard resembles its chest (art: fragment-<tier>.png).
const FRAGMENTS_PER_CHEST = 10;
// A dug shard's tier is rolled from the chosen voyage DURATION (longer = better), never above the cap for now.
// wooden = common · iron = pretty rare · gold (the cap) = very rare. Higher tiers exist but don't drop yet.
const FRAGMENT_TIER_CAP = "mythic"; // long trips reach one step past gold; short/standard stay lower
const fragmentArt = (tier) => `/images/sailing/fragment-${tier}.png`;

// Three embark durations: trip time = your (Speed-shortened) base voyage × mult; longer trips roll better
// shards. `frag` = tier weights (each option's own ceiling). Plain consts (no env) so they're easy to tune.
export const VOYAGE_OPTIONS = [
    { id: "short", label: "Short haul", mult: 1, frag: { wooden: 88, iron: 12 } },                 // ~4h
    { id: "standard", label: "Standard run", mult: 3, frag: { wooden: 70, iron: 24, gold: 6 } },   // ~12h
    { id: "long", label: "Long expedition", mult: 6, frag: { wooden: 54, iron: 28, gold: 15, mythic: 3 } }, // ~24h
];

// SAILING — dispatch your boat on a ONE-WAY voyage to a mysterious island; when it lands you play an
// excavation dig minigame (ESO-style: a grid of dirt, a limited stamina budget, an Augur "hot/cold" locator)
// trying to unearth a treasure-chest FRAGMENT before you run out. Win or fail, you return to port and can set
// sail again. Speed shortens the voyage; Luck adds dig stamina. Owner-gated while in development.

// Base voyage = 4 hours (the SHORT option). Standard = 12h, Long = 24h (see VOYAGE_OPTIONS mults).
export const BASE_VOYAGE_MS = 4 * 60 * 60 * 1000;
const SPEED_OFF_MS_PER_LEVEL = 2 * 60 * 1000;  // Speed shaves a FLAT 2 minutes off each voyage, per level
const SPEED_MIN_PER_LEVEL = 2;                 // ^ shown on the card
const MIN_VOYAGE_MS = 30 * 60 * 1000;          // a voyage never dips below 30 minutes
// Four boat upgrade tracks — all travel/loot, NO dig count (that's a separate future system). Each maxes at 20
// → 80 upgrade levels → the boat changes FORM every 10 levels across BOAT_TIERS (9) distinct arts, and each
// form unlocks a permanent perk (see MILESTONES). Fortune lives in the legacy luck_level column; Luck (early-
// find) in find_level.
export const MAX_SPEED_LEVEL = 20;
export const MAX_FORTUNE_LEVEL = 20;
export const MAX_RARITY_LEVEL = 20;
export const MAX_LUCK_LEVEL = 20;
const LEVELS_PER_FORM = 10;
const BOAT_TIERS = 9;

// After the free once-a-day tailwind is spent, extra tailwinds can be bought with gold. Temporarily FREE while
// the feature is in testing — set back to 500 before release.
export const WIND_RECHARGE_COST = 0; // TODO(luke): bump to 500 after testing

// ── Waves ── greet a passing member a few times a day for a little XP/coins + a small travel cut.
const WAVES_PER_DAY = 3;
const WAVE_XP = 25;
const WAVE_COINS = 10;
const WAVE_SHAVE_MS = 2 * 60 * 1000; // 2 minutes off the remaining voyage

// ── Marine encounters ── FORTUNE now drives the chance a voyage rolls an encounter at its halfway mark
// (repurposed from "+buried fragments"). No push / no travel pause — it resolves lazily on the member's next
// check-in and shows a one-off recap modal.
const ENCOUNTER_BASE = 0.20;          // base chance per voyage
const ENCOUNTER_PER_FORTUNE = 0.015;  // +1.5% per Fortune level → +30% at max (20)
const ENCOUNTER_CHANCE_CAP = 0.65;
function encounterChance(fortuneLevel = 0) {
    return Math.min(ENCOUNTER_CHANCE_CAP, ENCOUNTER_BASE + Math.max(0, fortuneLevel) * ENCOUNTER_PER_FORTUNE);
}
// Foes you can meet at sea — pure flavor; rewards are rolled separately so any foe can drop anything.
const ENCOUNTERS = [
    { foe: "roaming pirates", emoji: "🏴‍☠️", loot: "looted their hold" },
    { foe: "a lurking kraken", emoji: "🐙", loot: "salvaged its hide" },
    { foe: "a giant clam", emoji: "🦪", loot: "prised a pearl from its shell" },
    { foe: "a ghost galleon", emoji: "👻", loot: "plundered its spectral hold" },
    { foe: "a sea serpent", emoji: "🐍", loot: "harvested its glittering scales" },
    { foe: "a rogue leviathan", emoji: "🐋", loot: "carved a trove from the deep" },
    { foe: "a smuggler's sloop", emoji: "⛵", loot: "seized their contraband" },
    { foe: "a reef drake", emoji: "🐉", loot: "raided its sunken nest" },
];
// Bonus loot table (weighted). Always-on XP + coins are separate; this is the extra thrill. Deliberately
// LOW-power (fragments, cheap pet treats, low chests, a spin token) — nothing that swings the boss fight.
const ENCOUNTER_LOOT = [
    { w: 22, kind: "none" },
    { w: 26, kind: "fragment", n: 1, label: "a chest fragment", emoji: "🔩" },
    { w: 10, kind: "fragment", n: 2, label: "2 chest fragments", emoji: "🔩" },
    { w: 12, kind: "consumable", id: "treat_bone", label: "a Pet Treat", emoji: "🦴" },
    { w: 7,  kind: "consumable", id: "treat_snack", label: "a Hearty Snack", emoji: "🍖" },
    { w: 11, kind: "chest", tier: "wooden", label: "a Wooden chest", emoji: "📦" },
    { w: 5,  kind: "chest", tier: "iron", label: "an Iron chest", emoji: "⚙️" },
    { w: 4,  kind: "consumable", id: "spin_lucky_coin", label: "a Lucky Coin (+2 spins)", emoji: "🎟️" },
    { w: 3,  kind: "consumable", id: "stone_storm", label: "a Storm Crystal (+3 strikes)", emoji: "🔷" },
];
function pickWeighted(list) {
    const total = list.reduce((s, x) => s + x.w, 0) || 1;
    let r = Math.random() * total;
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
}

// Dig board.
const DIG_COLS = 4;
const DIG_ROWS = 4;
const DIG_MAX_DEPTH = 3;      // layers of dirt over every tile — you chip straight down through them
const BASE_STAMINA = 12;      // digs per voyage (flat; extend mid-dig with "buy more digs")
const FRAGMENTS_BURIED = 3;   // base fragments scattered through the dirt; Fortune adds +1 buried per level
const MAX_BURIED = 12;        // cap on buried fragments (of a 16-tile board)
const RARITY_UPGRADE_PER_LEVEL = 0.045; // Rarity: chance/level that a forged chest is bumped up a tier
const LUCK_PER_SHALLOW = 7;   // Luck: every this many levels, fragments sit one dirt-layer shallower
const DIG_REFILL = 5;         // extra digs you can buy mid-excavation
const DIG_REFILL_COST = 0;    // gold per refill — FREE while testing; set to ~300 before release

// ── DIGGING UPGRADES (separate from the boat) ── five gold-leveled tracks. Each track's PER-LEVEL value ×
// its MAX level = the cap Luke asked for.
const DIG_TRACKS = {
    stamina:   { max: 10, per: 1,    cap: 10,   kind: "count" }, // +1 dig per trip / level
    pierce:    { max: 5,  per: 0.03, cap: 0.15, kind: "pct" },   // dig clears ALL layers of a tile — 15% max
    strike:    { max: 5,  per: 0.02, cap: 0.10, kind: "pct" },   // a dig strikes a lucky bonus fragment — 10% max
    efficient: { max: 5,  per: 0.04, cap: 0.20, kind: "pct" },   // a tool doesn't spend its stamina charge — 20% max
    detonator: { max: 5,  per: 0.01, cap: 0.05, kind: "pct" },   // a dig spawns a free explosion — 5% max
};
const digTrackValue = (t, lvl) => Math.min(DIG_TRACKS[t].cap, Math.max(0, lvl) * DIG_TRACKS[t].per);

// Area-clear TOOLS — unlocked every 10 excavation levels (excavation level = voyages completed). Using one
// spends `stamina` from your dig budget (unless Efficient procs) and clears a cols×rows patch, `layers` deep.
const DIG_TOOLS = [
    { id: "wide",  name: "Wide Dig",   emoji: "🪓", unlock: 10, stamina: 2, cols: 2, rows: 2, layers: 1 },
    { id: "deep",  name: "Deep Blast", emoji: "💥", unlock: 20, stamina: 3, cols: 2, rows: 2, layers: 2 },
    { id: "quake", name: "Quake",      emoji: "🌋", unlock: 30, stamina: 4, cols: 3, rows: 3, layers: 1 },
];
const EXCAVATION_PER_TOOL = 10;
const excavationLevel = (voyages = 0) => Math.max(0, voyages);
const unlockedTools = (voyages = 0) => DIG_TOOLS.filter((t) => excavationLevel(voyages) >= t.unlock);
const DIG_TRACK_COL = { stamina: "dig_stamina_level", pierce: "dig_pierce_level", strike: "dig_strike_level", efficient: "dig_efficient_level", detonator: "dig_detonator_level" };
function digTrackView(row, t) {
    const lvl = row?.[DIG_TRACK_COL[t]] || 0;
    const def = DIG_TRACKS[t];
    return { level: lvl, max: def.max, cost: upgradeCost(lvl), maxed: lvl >= def.max, kind: def.kind, cap: def.cap, valueNow: digTrackValue(t, lvl), valueNext: digTrackValue(t, lvl + 1) };
}
function digUpgradesView(row) {
    const stamLvl = row?.dig_stamina_level || 0;
    return {
        stamina: { ...digTrackView(row, "stamina"), digsNow: digStamina(stamLvl), digsNext: digStamina(stamLvl + 1) },
        pierce: digTrackView(row, "pierce"),
        strike: digTrackView(row, "strike"),
        efficient: digTrackView(row, "efficient"),
        detonator: digTrackView(row, "detonator"),
    };
}
function excavationView(voyages) {
    const lvl = excavationLevel(voyages);
    const tools = DIG_TOOLS.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, unlock: t.unlock, stamina: t.stamina, cols: t.cols, rows: t.rows, layers: t.layers, unlocked: lvl >= t.unlock }));
    return { level: lvl, perTool: EXCAVATION_PER_TOOL, tools, nextTool: tools.find((t) => !t.unlocked) || null };
}

// The 8 boat FORMS. Reaching each level unlocks a new hull art (BOAT_ART[tier]) + a permanent perk applied by
// boatPerks(). Perks are cumulative and reuse the existing engine knobs so they're cheap + safe.
const MILESTONES = [
    { level: 10, tier: 2, name: "Swift Cutter", perk: "+1 fragment buried on every island", buried: 1 },
    { level: 20, tier: 3, name: "Trade Brig", perk: "Voyages are 10% faster", voyage: 0.9 },
    { level: 30, tier: 4, name: "Trade-Wind Schooner", perk: "+12% chance a forged chest is upgraded a tier", chest: 0.12 },
    { level: 40, tier: 5, name: "Gilded Galleon", perk: "15% chance a tailwind isn't used up", windSave: 0.15 },
    { level: 50, tier: 6, name: "Iron Man-o'-War", perk: "Your first dig each trip always strikes a fragment", surface: true },
    { level: 60, tier: 7, name: "Arcane Frigate", perk: "Voyages are another 10% faster", voyage: 0.9 },
    { level: 70, tier: 8, name: "Dragon Ship", perk: "+1 fragment buried + 12% chest-upgrade chance", buried: 1, chest: 0.12 },
    { level: 80, tier: 9, name: "Ghost Ship", perk: "Forge chests with 8 fragments instead of 10", forge: 8 },
];

const BOAT_ART = {
    1: "/images/sailing/boat-tier1-wood.png",
    2: "/images/sailing/boat-tier2-cutter.png",
    3: "/images/sailing/boat-tier3-brig.png",
    4: "/images/sailing/boat-tier4-schooner.png",
    5: "/images/sailing/boat-tier5-galleon.png",
    6: "/images/sailing/boat-tier6-manowar.png",
    7: "/images/sailing/boat-tier7-arcane.png",
    8: "/images/sailing/boat-tier8-dragon.png",
    9: "/images/sailing/boat-tier9-ghost.png",
};
export const OCEAN_BG = "/images/sailing/ocean-bg.png";
export const DIG_BG = "/images/sailing/dig-bg.png";
export const ISLAND_ART = "/images/sailing/island.png";
// Ten scrolling sky/seascapes — the client randomly picks one per app open, so the horizon varies (sunset,
// night, storm, fog…) each session and scrolls behind the boat while sailing.
const SKY_BGS = ["sunset", "sunrise", "night", "storm", "fog", "clearday", "goldenhour", "dusk", "overcast", "aurora"]
    .map((t) => `/images/sailing/sky-${t}.png`);
// Dig-pit backdrop hints at the RARITY of the duration you chose (short→plain, standard→gold, long→mythic).
const DIG_BGS = { short: "/images/sailing/dig-short.png", standard: "/images/sailing/dig-standard.png", long: "/images/sailing/dig-long.png" };

// --- pure curves ---------------------------------------------------------------------------------------
// A new boat form every LEVELS_PER_FORM levels, capped at BOAT_TIERS distinct arts (level 80 → tier 9).
export function boatTier(level) { return Math.min(BOAT_TIERS, Math.floor(Math.max(1, level) / LEVELS_PER_FORM) + 1); }
export function boatArt(level) {
    // Show the highest boat art at/below this tier (so un-minted higher tiers fall back to the last real one).
    for (let t = boatTier(level); t >= 1; t--) if (BOAT_ART[t]) return BOAT_ART[t];
    return BOAT_ART[1];
}
// Cumulative milestone perks unlocked at this boat level.
function boatPerks(level) {
    const p = { buried: 0, voyageMult: 1, chestBonus: 0, surface: false, forgeCost: FRAGMENTS_PER_CHEST, windSave: 0 };
    for (const m of MILESTONES) {
        if (level < m.level) break;
        if (m.buried) p.buried += m.buried;
        if (m.voyage) p.voyageMult *= m.voyage;
        if (m.chest) p.chestBonus += m.chest;
        if (m.surface) p.surface = true;
        if (m.forge) p.forgeCost = m.forge;
        if (m.windSave) p.windSave = Math.max(p.windSave, m.windSave);
    }
    return p;
}
// The 8 boat forms for the UI: each milestone with its unlock level, perk, and unlocked/current state.
function boatFormsView(level) {
    return MILESTONES.map((m) => ({
        level: m.level, tier: m.tier, name: m.name, perk: m.perk,
        art: BOAT_ART[m.tier] || BOAT_ART[1],
        unlocked: level >= m.level,
        current: level >= m.level && (m.level === 80 || level < m.level + LEVELS_PER_FORM), // the freshest unlocked form
    }));
}
function rawVoyageMs(speedLevel = 0) {
    return Math.max(MIN_VOYAGE_MS, BASE_VOYAGE_MS - Math.max(0, speedLevel) * SPEED_OFF_MS_PER_LEVEL);
}
// Voyage time including the boat's speed-perk milestones.
export function voyageDurationMs(speedLevel = 0, level = 1) {
    return Math.max(MIN_VOYAGE_MS, Math.round(rawVoyageMs(speedLevel) * boatPerks(level).voyageMult));
}
// Progressive cost — each level costs quadratically more than the last.
function upgradeCost(nextLevel) { return 100 * (nextLevel + 1) * (nextLevel + 1); }
// Dig count is a DIGGING upgrade (not a boat lever): base budget + the Stamina track.
function digStamina(staminaLevel = 0) { return BASE_STAMINA + Math.round(digTrackValue("stamina", staminaLevel)); }
// Buried fragments per island — base + boat-FORM milestone bonuses. (Fortune no longer feeds this; it now
// drives marine-encounter chance instead — see encounterChance.)
function fragmentsBuried(level = 1) {
    return Math.min(MAX_BURIED, FRAGMENTS_BURIED + boatPerks(level).buried);
}
// The boat's level is EARNED BY UPGRADING, not by digging: one level per upgrade level bought across 4 tracks.
function boatLevelFromUpgrades(s = 0, f = 0, r = 0, l = 0) { return 1 + Math.max(0, s) + Math.max(0, f) + Math.max(0, r) + Math.max(0, l); }

// --- dig board -----------------------------------------------------------------------------------------
function randInt(n) { return Math.floor(Math.random() * n); }

// Luck (find_level): how shallow the shallowest a fragment can sit — higher Luck = struck sooner.
function fragMaxDepth(luckLevel = 0) { return Math.max(1, DIG_MAX_DEPTH - Math.floor(Math.max(0, luckLevel) / LUCK_PER_SHALLOW)); }

function newBoard(row) {
    const fortuneLevel = row?.luck_level || 0;
    const luckLevel = row?.find_level || 0;
    const level = boatLevelFromUpgrades(row?.speed_level || 0, fortuneLevel, row?.rarity_level || 0, luckLevel);
    // Every tile is a stack of 1–DIG_MAX_DEPTH dirt layers you chip through. Fragments are scattered under
    // random individual tiles — NO clusters, NO pointer, NO shimmer. Fortune enriches the island with more
    // buried fragments; Luck buries them shallower (struck sooner). Never learn a tile's secret until the bottom.
    const depth = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => 1 + randInt(DIG_MAX_DEPTH)));
    const cells = [];
    for (let r = 0; r < DIG_ROWS; r++) for (let c = 0; c < DIG_COLS; c++) cells.push([r, c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = randInt(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const frag = cells.slice(0, fragmentsBuried(level));
    // Luck caps how deep a fragment tile can be; the "first strike guaranteed" perk forces one to the surface.
    const cap = fragMaxDepth(luckLevel);
    const perks = boatPerks(level);
    frag.forEach(([fr, fc], i) => { depth[fr][fc] = perks.surface && i === 0 ? 1 : (1 + randInt(cap)); });
    const dug = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => false));
    const stamina = digStamina(row?.dig_stamina_level || 0);
    // Bake the digging-upgrade proc chances + unlocked tools onto the board so every dig can apply them.
    const up = {
        pierce: digTrackValue("pierce", row?.dig_pierce_level || 0),
        strike: digTrackValue("strike", row?.dig_strike_level || 0),
        efficient: digTrackValue("efficient", row?.dig_efficient_level || 0),
        detonator: digTrackValue("detonator", row?.dig_detonator_level || 0),
    };
    const tools = unlockedTools(row?.voyages_completed || 0).map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, stamina: t.stamina, cols: t.cols, rows: t.rows, layers: t.layers }));
    return { cols: DIG_COLS, rows: DIG_ROWS, depth, maxDepth: DIG_MAX_DEPTH, frag, dug, stamina, maxStamina: stamina, status: "active", up, tools, bonus: 0 };
}

// Resolve the board's status after a mutation. Win = every buried fragment unearthed, OR out of digs with at
// least one fragment (unearthed or a lucky Strike bonus) to your name.
function resolveBoard(board) {
    const found = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
    if (found >= board.frag.length) board.status = "won";
    else if (board.stamina <= 0) board.status = (found + (board.bonus || 0)) >= 1 ? "won" : "lost";
    return found;
}

// Server-authoritative dig — chips one layer off a tile, plus the digging-upgrade procs (pierce / strike /
// detonator). Returns the mutated board.
function applyDig(board, r, c) {
    if (board.status !== "active" || board.stamina <= 0) return board;
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return board;
    if (board.depth[r][c] <= 0) return board; // already chipped to the bottom — never wastes a dig
    board.stamina -= 1;
    board.dug[r][c] = true;
    const up = board.up || {};
    // Pierce: this dig breaks through EVERY remaining layer of the tile at once (else just one).
    if (up.pierce && Math.random() < up.pierce) board.depth[r][c] = 0;
    else board.depth[r][c] -= 1;
    // Strike: a lucky bonus fragment (no location tell — it's just extra loot on this swing).
    if (up.strike && Math.random() < up.strike) board.bonus = (board.bonus || 0) + 1;
    // Detonator: a free explosion clears the 3×3 around the dig by one layer.
    if (up.detonator && Math.random() < up.detonator) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols && board.depth[nr][nc] > 0) { board.depth[nr][nc] -= 1; board.dug[nr][nc] = true; }
        }
    }
    resolveBoard(board);
    return board;
}

// Use an unlocked area-clear TOOL at (r,c): spend its stamina charge (unless Efficient procs) and clear a
// cols×rows patch `layers` deep. Returns { ok, board } — ok:false when the tool can't be used.
function applyTool(board, toolId, r, c) {
    if (board.status !== "active") return { ok: false };
    const tool = (board.tools || []).find((t) => t.id === toolId);
    if (!tool) return { ok: false };
    const up = board.up || {};
    const free = up.efficient && Math.random() < up.efficient;
    const cost = free ? 0 : tool.stamina;
    if (board.stamina < cost) return { ok: false };
    board.stamina -= cost;
    for (let dr = 0; dr < tool.rows; dr++) for (let dc = 0; dc < tool.cols; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols) {
            board.dug[nr][nc] = true;
            board.depth[nr][nc] = Math.max(0, board.depth[nr][nc] - tool.layers);
        }
    }
    resolveBoard(board);
    return { ok: true, free };
}

// The client-safe view of a board. Reveals each tile's remaining rock depth (so the layers can be drawn) and
// nothing about where the fragments are — a tile only flags `found` once it's been chipped to the bottom AND it
// hid a fragment. No pointer, no shimmer: the board never tells you where to dig next.
function boardView(board) {
    const maxDepth = board.maxDepth || DIG_MAX_DEPTH;
    const fragSet = new Set(board.frag.map(([r, c]) => `${r},${c}`));
    const tiles = [];
    for (let r = 0; r < board.rows; r++) {
        const row = [];
        for (let c = 0; c < board.cols; c++) {
            row.push({
                depth: board.depth[r][c],   // rock layers still on top (drives the stacked-slab drawing)
                maxDepth,
                dug: board.dug[r][c],
                found: fragSet.has(`${r},${c}`) && board.depth[r][c] === 0, // fragment unearthed at the bottom
            });
        }
        tiles.push(row);
    }
    const found = board.frag.filter(([r, c]) => board.depth[r][c] === 0).length;
    return { cols: board.cols, rows: board.rows, maxDepth, stamina: board.stamina, maxStamina: board.maxStamina, status: board.status, tiles, buried: board.frag.length, found, bonus: board.bonus || 0, tools: board.tools || [] };
}

// --- state ---------------------------------------------------------------------------------------------
function decorate(row) {
    const speedLevel = row?.speed_level || 0;
    const fortuneLevel = row?.luck_level || 0; // Fortune is stored in the legacy luck_level column
    const rarityLevel = row?.rarity_level || 0;
    const luckLevel = row?.find_level || 0;    // "Luck" = early-find (find_level column)
    const level = boatLevelFromUpgrades(speedLevel, fortuneLevel, rarityLevel, luckLevel); // earned by upgrading, never digging

    const departedAt = row?.departed_at ? new Date(row.departed_at).getTime() : null;
    const arrivesAt = row?.returns_at ? new Date(row.returns_at).getTime() : null; // returns_at = island arrival
    const dig = row?.dig_state || null;
    const now = Date.now();

    let status = "idle";
    if (dig && dig.status === "active") status = "digging";
    else if (departedAt && arrivesAt) status = now >= arrivesAt ? "arrived" : "sailing";

    // Progress is REMAINING-based (how close to arrival vs. the ORIGINAL planned trip) so a tailwind — which
    // shortens the remaining time — visibly jumps the boat forward. Elapsed-based math left it pinned at 0
    // until the trip collapsed. Fall back to the current span for legacy voyages with no stored voyage_ms.
    const voyageTotalMs = Number(row?.voyage_ms) || (departedAt && arrivesAt ? Math.max(1, arrivesAt - departedAt) : 0);
    let progress = 0;
    if (status === "sailing" && arrivesAt && voyageTotalMs > 0) progress = Math.min(0.999, Math.max(0, 1 - (arrivesAt - now) / voyageTotalMs));
    else if (status === "arrived" || status === "digging") progress = 1;

    const rarityPct = (lvl) => Math.min(90, Math.round((Math.max(0, lvl) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus) * 100));
    return {
        level, maxLevel: boatLevelFromUpgrades(MAX_SPEED_LEVEL, MAX_FORTUNE_LEVEL, MAX_RARITY_LEVEL, MAX_LUCK_LEVEL),
        tier: boatTier(level), boatTiers: BOAT_TIERS, boatArt: boatArt(level),
        forms: boatFormsView(level),
        oceanBg: OCEAN_BG, digBg: DIG_BGS[row?.voyage_quality] || DIG_BG, islandArt: ISLAND_ART,
        skies: SKY_BGS, // the client picks one at random per app open + scrolls it while sailing
        voyageTotalMs, // original planned trip length, for the remaining-based progress bar
        voyagesCompleted: row?.voyages_completed || 0,
        fragments: totalFragments(row),
        fragmentsPerChest: boatPerks(level).forgeCost,
        fragmentTiers: fragmentsView(row, level),
        // Embark duration choices — trip time + which shards each favours — for the "set sail" picker.
        voyageOptions: VOYAGE_OPTIONS.map((o) => ({
            id: o.id, label: o.label,
            ms: Math.round(voyageDurationMs(speedLevel, level) * o.mult),
            topTier: Object.keys(o.frag)[Object.keys(o.frag).length - 1],
        })),
        digRefill: { amount: DIG_REFILL, cost: DIG_REFILL_COST },
        // The boat's FOUR travel/loot levers — all boat-exclusive. Each carries its per-level effect + current/next value.
        speed: {
            level: speedLevel, max: MAX_SPEED_LEVEL, cost: upgradeCost(speedLevel), maxed: speedLevel >= MAX_SPEED_LEVEL,
            minPerLevel: SPEED_MIN_PER_LEVEL, voyageNow: voyageDurationMs(speedLevel, level), voyageNext: voyageDurationMs(speedLevel + 1, level),
        },
        fortune: {
            level: fortuneLevel, max: MAX_FORTUNE_LEVEL, cost: upgradeCost(fortuneLevel), maxed: fortuneLevel >= MAX_FORTUNE_LEVEL,
            encounterNow: Math.round(encounterChance(fortuneLevel) * 100), encounterNext: Math.round(encounterChance(fortuneLevel + 1) * 100),
        },
        rarity: {
            level: rarityLevel, max: MAX_RARITY_LEVEL, cost: upgradeCost(rarityLevel), maxed: rarityLevel >= MAX_RARITY_LEVEL,
            pctNow: rarityPct(rarityLevel), pctNext: rarityPct(rarityLevel + 1),
        },
        luck: {
            level: luckLevel, max: MAX_LUCK_LEVEL, cost: upgradeCost(luckLevel), maxed: luckLevel >= MAX_LUCK_LEVEL,
            depthNow: fragMaxDepth(luckLevel), depthNext: fragMaxDepth(luckLevel + 1),
        },
        voyageMs: voyageDurationMs(speedLevel, level),
        // Digging upgrade system (separate from the boat).
        digUpgrades: digUpgradesView(row),
        excavation: excavationView(row?.voyages_completed || 0),
        status, progress, departedAt, arrivesAt,
        // Waves — greet a passing sailor a few times a day (only meaningful mid-voyage).
        waves: {
            max: WAVES_PER_DAY,
            left: Math.max(0, WAVES_PER_DAY - (row?.wave_is_today ? (row?.wave_count || 0) : 0)),
            xp: WAVE_XP, coins: WAVE_COINS, minutes: WAVE_SHAVE_MS / 60000,
        },
        // A resolved-but-unacknowledged marine encounter, if any — the client shows it as a one-off recap modal.
        encounter: (row && row.encounter_result) || null,
        // Once-a-day "favorable winds" boost (shaves an hour off the trip) — only offered mid-voyage.
        windAvailable: status === "sailing" && !row?.wind_used_today,
        // After the free one is spent, extra tailwinds can be bought for this much gold (0 while testing).
        windRecharge: { cost: WIND_RECHARGE_COST },
        dig: status === "digging" ? boardView(dig) : null,
    };
}

async function readRow(buyerId) {
    // Compute "did they already use today's favorable-winds boost" in SQL (store-local day) to sidestep the
    // JS-Date-from-a-DATE-column timezone trap.
    return db.queryOne(
        `SELECT *, (wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS wind_used_today,
                (wave_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS wave_is_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

// Resolve a DUE, unresolved encounter exactly once: roll the outcome, atomically CLAIM it (so only the first
// concurrent caller writes the result), then apply the grants. A no-op when nothing is pending/due.
async function resolveDueEncounter(buyerId) {
    const row = await readRow(buyerId);
    if (!row || !row.encounter_at || row.encounter_result) return;
    if (new Date(row.encounter_at).getTime() > Date.now()) return; // halfway mark not reached yet
    const enc = ENCOUNTERS[randInt(ENCOUNTERS.length)];
    const xp = 150 + randInt(211);   // decent: 150–360
    const coins = 20 + randInt(51);  // small: 20–70
    const loot = pickWeighted(ENCOUNTER_LOOT);
    const result = {
        foe: enc.foe, emoji: enc.emoji, loot: enc.loot, xp, coins,
        bonus: loot.kind === "none" ? null : { label: loot.label, emoji: loot.emoji },
    };
    // Claim atomically — the WHERE guarantees a single winner, so the grants below run exactly once.
    const claimed = await db.queryOne(
        `UPDATE mkt_sailing SET encounter_result = $2::jsonb, updated_at = NOW()
          WHERE buyer_id = $1 AND encounter_at IS NOT NULL AND encounter_at <= NOW() AND encounter_result IS NULL
          RETURNING buyer_id`,
        [buyerId, JSON.stringify(result)]
    ).catch(() => null);
    if (!claimed) return;
    await awardXp(buyerId, "sail_encounter", { points: xp, gold: coins }).catch(() => {});
    if (loot.kind === "fragment") await grantFragment(buyerId, loot.n || 1).catch(() => {});
    else if (loot.kind === "chest") await addChests(buyerId, { [loot.tier]: 1 }).catch(() => {});
    else if (loot.kind === "consumable") await grantConsumable(buyerId, loot.id, 1).catch(() => {});
}

export async function getSailingState(buyerId) {
    await resolveDueEncounter(buyerId).catch(() => {}); // apply a due encounter (once) so "checking back" surfaces it
    const [row, goldRow, others, petMap] = await Promise.all([
        readRow(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // Everyone else sails the horizon behind you — a REAL member riding their REAL ship + pet. Every member
        // has at least the starter hull; if they've bought boat upgrades we show that form. Ordered by recent
        // activity so you see LIVE players, not always the same top-XP account.
        db.query(
            `SELECT b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.avatar_url, b.featured_collectible,
                    COALESCE(s.speed_level, 0) AS speed_level, COALESCE(s.luck_level, 0) AS luck_level,
                    COALESCE(s.rarity_level, 0) AS rarity_level, COALESCE(s.find_level, 0) AS find_level
               FROM mkt_buyer b
               LEFT JOIN mkt_sailing s ON s.buyer_id = b.id
              WHERE b.id <> $1 AND b.alias IS NOT NULL
                AND (b.avatar_sprite_url IS NOT NULL OR b.avatar_url IS NOT NULL)
              ORDER BY b.last_seen_at DESC NULLS LAST, COALESCE(b.xp, 0) DESC
              LIMIT 24`,
            [buyerId]
        ).catch(() => []),
        getPetSpriteData().catch(() => ({})),
    ]);
    const fleet = (others || []).map((o) => {
        const pet = o.featured_collectible ? petMap[o.featured_collectible] : null;
        return {
            art: boatArt(boatLevelFromUpgrades(o.speed_level, o.luck_level, o.rarity_level, o.find_level)),
            name: o.alias,
            rider: o.avatar_sprite_url || o.avatar_url || null,
            // Only the AI sprite needs the face-right mirror; the built avatar already faces forward.
            riderFlip: o.avatar_sprite_url ? o.avatar_sprite_flip === true : false,
            pet: pet?.url || null,
            petFlip: pet?.flip === true,
        };
    });
    // Only pad if literally nobody else has a hero yet, so the horizon isn't dead empty in early testing.
    for (const t of [1, 2, 1]) if (fleet.length < 3) fleet.push({ art: BOAT_ART[t] || BOAT_ART[1], name: null, rider: null, riderFlip: false, pet: null, petFlip: false });
    // Pick the random horizon backdrop HERE (server-side) so it's baked into the first paint — the client no
    // longer flips from a default to the chosen one on load.
    const sky = SKY_BGS[Math.floor(Math.random() * SKY_BGS.length)];
    return { ...decorate(row), gold: goldRow?.gold || 0, fleet, sky };
}

export async function startVoyage(buyerId, optionId = "standard") {
    const state = decorate(await readRow(buyerId));
    if (state.status !== "idle") return { ok: false, error: "busy", ...(await getSailingState(buyerId)) };
    const opt = VOYAGE_OPTIONS.find((o) => o.id === optionId) || VOYAGE_OPTIONS[1];
    const ms = Math.round(voyageDurationMs(state.speed.level, state.level) * opt.mult);
    // Fortune-scaled roll for a marine encounter at the ORIGINAL halfway mark; reset any prior encounter.
    const encMs = Math.random() < encounterChance(state.fortune.level) ? String(Math.round(ms / 2)) : null;
    await db.query(
        `INSERT INTO mkt_sailing (buyer_id, departed_at, returns_at, dig_state, voyage_quality, voyage_ms, encounter_at, encounter_result, updated_at)
         VALUES ($1, NOW(), NOW() + ($2 || ' milliseconds')::interval, NULL, $3, $4,
                 CASE WHEN $5::bigint IS NULL THEN NULL ELSE NOW() + ($5 || ' milliseconds')::interval END, NULL, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET departed_at = NOW(), returns_at = NOW() + ($2 || ' milliseconds')::interval,
                 dig_state = NULL, voyage_quality = $3, voyage_ms = $4,
                 encounter_at = CASE WHEN $5::bigint IS NULL THEN NULL ELSE NOW() + ($5 || ' milliseconds')::interval END,
                 encounter_result = NULL, updated_at = NOW()`,
        [buyerId, String(ms), opt.id, ms, encMs]
    ).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Wave to a passing sailor — up to WAVES_PER_DAY/day, each a little XP + coins + a small travel-time cut.
// Atomic: the WHERE enforces mid-voyage + the daily cap so rapid taps can't overspend.
export async function waveAtSailor(buyerId) {
    const state = decorate(await readRow(buyerId));
    if (state.status !== "sailing") return { ok: false, error: "not_sailing", ...(await getSailingState(buyerId)) };
    const waved = await db.queryOne(
        `UPDATE mkt_sailing
            SET wave_count = CASE WHEN wave_day = (NOW() AT TIME ZONE 'America/Chicago')::date THEN wave_count + 1 ELSE 1 END,
                wave_day = (NOW() AT TIME ZONE 'America/Chicago')::date,
                returns_at = GREATEST(NOW(), returns_at - ($2 || ' milliseconds')::interval),
                updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at IS NOT NULL AND returns_at > NOW()
            AND (wave_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date OR wave_count < $3)
          RETURNING wave_count`,
        [buyerId, String(WAVE_SHAVE_MS), WAVES_PER_DAY]
    ).catch(() => null);
    if (!waved) return { ok: false, error: "no_waves", ...(await getSailingState(buyerId)) };
    await awardXp(buyerId, "sail_wave", { points: WAVE_XP, gold: WAVE_COINS }).catch(() => {});
    return { ok: true, waved: { xp: WAVE_XP, coins: WAVE_COINS, minutes: WAVE_SHAVE_MS / 60000 }, ...(await getSailingState(buyerId)) };
}

// Acknowledge (dismiss) a resolved encounter's recap — clears it so it never shows again.
export async function ackEncounter(buyerId) {
    await db.query(`UPDATE mkt_sailing SET encounter_result = NULL, encounter_at = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Once-a-day favorable winds: shave an hour off the remaining voyage (clamped so it can only reach "arrived",
// never overshoot). Atomic — the WHERE enforces once-per-store-day and that a voyage is actually in progress.
export async function favorableWind(buyerId) {
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'),
                wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date, updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL
            AND returns_at IS NOT NULL AND returns_at > NOW()
            AND wind_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    // Milestone perk (Trade-Wind Schooner): chance the tailwind ISN'T consumed — clear wind_day so it's free again.
    const save = boatPerks(decorate(await readRow(buyerId)).level).windSave;
    let windRefunded = false;
    if (save > 0 && Math.random() < save) {
        await db.query(`UPDATE mkt_sailing SET wind_day = NULL WHERE buyer_id = $1`, [buyerId]).catch(() => {});
        windRefunded = true;
    }
    return { ok: true, windRefunded, ...(await getSailingState(buyerId)) };
}

// Paid re-use of the tailwind once the free daily one is spent: charge gold, then shave another hour off the
// remaining voyage. Free while WIND_RECHARGE_COST is 0 (testing). Only valid mid-voyage.
export async function rechargeWind(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "sailing") return { ok: false, error: "not_sailing", ...(await getSailingState(buyerId)) };
    if (WIND_RECHARGE_COST > 0 && (state.gold || 0) < WIND_RECHARGE_COST) {
        return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }
    // Apply the hour first (also validates a voyage is actually in progress) so we never charge with no effect.
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'), updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at IS NOT NULL AND returns_at > NOW()
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    if (WIND_RECHARGE_COST > 0) {
        await db.query(`UPDATE mkt_buyer SET gold = GREATEST(0, gold - $2) WHERE id = $1`, [buyerId, WIND_RECHARGE_COST]).catch(() => {});
    }
    return { ok: true, spent: WIND_RECHARGE_COST, ...(await getSailingState(buyerId)) };
}

// Grant treasure-chest fragment(s) to a member (used by the Cheer first-of-day item proc). Upserts the sailing
// row first, since a member may never have sailed.
export async function grantFragment(buyerId, n = 1) {
    if (!buyerId || n <= 0) return;
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    // Granted shards are base (wooden) tier — merge into the per-tier hold.
    await db.query(
        `UPDATE mkt_sailing
            SET fragments_json = jsonb_set(
                    COALESCE(fragments_json, '{}'::jsonb), '{wooden}',
                    to_jsonb(COALESCE((fragments_json->>'wooden')::int, 0) + $2)),
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, n]
    ).catch(() => {});
}

// Spend fragments to forge a loot chest. The cost is boatPerks().forgeCost (10, or 8 at the level-80 form).
// Rarity (+ chest milestone perks) gives a chance the forged chest is BUMPED up a tier (Iron → Gold). Atomic —
// the WHERE guards against forging with too few (or a double-tap racing the balance).
export async function forgeChest(buyerId, fragmentTier = "wooden") {
    const row = await readRow(buyerId);
    const level = decorate(row).level;
    const cost = boatPerks(level).forgeCost;
    if (!CHEST_TIERS[fragmentTier]) return { ok: false, error: "bad_tier", ...(await getSailingState(buyerId)) };
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    // Atomic guarded spend of `cost` shards from THIS tier's hold (the WHERE stops a double-tap overdraw).
    const spent = await db.queryOne(
        `UPDATE mkt_sailing
            SET fragments_json = jsonb_set(COALESCE(fragments_json, '{}'::jsonb), $3::text[],
                    to_jsonb(COALESCE((fragments_json->>$4)::int, 0) - $2)),
                updated_at = NOW()
          WHERE buyer_id = $1 AND COALESCE((fragments_json->>$4)::int, 0) >= $2
          RETURNING fragments_json`,
        [buyerId, cost, `{${fragmentTier}}`, fragmentTier]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "not_enough", ...(await getSailingState(buyerId)) };
    // Rarity roll: chance the forged chest comes out one tier ABOVE the shards you spent (a bonus, not capped).
    const upgradeChance = Math.min(0.9, (row?.rarity_level || 0) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus);
    let tierKey = fragmentTier;
    if (Math.random() < upgradeChance) {
        const i = CHEST_ORDER.indexOf(tierKey);
        if (i >= 0 && i < CHEST_ORDER.length - 1) tierKey = CHEST_ORDER[i + 1];
    }
    await addChests(buyerId, { [tierKey]: 1 }).catch(() => {});
    const tier = CHEST_TIERS[tierKey];
    const upgraded = tierKey !== fragmentTier;
    return { ok: true, forged: { tier: tierKey, label: tier?.label || "Chest", emoji: tier?.emoji || "🎁", upgraded, from: fragmentTier }, ...(await getSailingState(buyerId)) };
}

// Buy DIG_REFILL more digs for the active excavation with gold. Atomic gold spend; only valid mid-dig.
export async function buyDigs(buyerId) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    if (DIG_REFILL_COST > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, DIG_REFILL_COST]).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }
    board.stamina += DIG_REFILL;
    board.maxStamina += DIG_REFILL;
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, spent: DIG_REFILL_COST, ...(await getSailingState(buyerId)) };
}

export async function beginDig(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "arrived") return { ok: false, error: "not_arrived", ...(await getSailingState(buyerId)) };
    const board = newBoard(row);
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// The tier one step up the ladder, but never past the fragment cap.
function nextTierCapped(tier) {
    const capIdx = CHEST_ORDER.indexOf(FRAGMENT_TIER_CAP);
    const i = CHEST_ORDER.indexOf(tier);
    return i >= 0 && i < capIdx ? CHEST_ORDER[i + 1] : tier;
}
// Roll one dug shard's tier from the voyage's duration weights, with a small Rarity chance to bump it up a
// tier (never past the cap).
function rollFragmentTier(qualityId, rarityLevel = 0, level = 1) {
    const opt = VOYAGE_OPTIONS.find((o) => o.id === qualityId) || VOYAGE_OPTIONS[1];
    const weights = opt.frag;
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * total;
    let tier = "wooden";
    for (const [t, w] of Object.entries(weights)) { r -= w; if (r <= 0) { tier = t; break; } }
    const bump = Math.min(0.9, Math.max(0, rarityLevel) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus);
    if (Math.random() < bump) tier = nextTierCapped(tier);
    return tier;
}
// Per-tier shard holdings for the UI: every droppable tier (up to the cap) + any tier already held.
function fragmentsView(row, level) {
    const counts = (row && typeof row.fragments_json === "object" && row.fragments_json) || {};
    const perChest = boatPerks(level).forgeCost;
    const capIdx = CHEST_ORDER.indexOf(FRAGMENT_TIER_CAP);
    return CHEST_ORDER
        .map((t, i) => ({ t, i }))
        .filter(({ t, i }) => i <= capIdx || (counts[t] || 0) > 0)
        .map(({ t, i }) => {
            const c = CHEST_TIERS[t] || {};
            const count = Number(counts[t]) || 0;
            return {
                tier: t,
                name: (c.label || t).replace(" Chest", ""),
                chestLabel: c.label || "Chest",
                emoji: c.emoji || "🎁",
                color: c.color || "#b08a52",
                art: fragmentArt(t),
                count,
                perChest,
                canForge: count >= perChest,
                droppable: i <= capIdx,
            };
        });
}
function totalFragments(row) {
    const counts = (row && typeof row.fragments_json === "object" && row.fragments_json) || {};
    return Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
}

// Resolve a finished dig: each shard unearthed (+ lucky Strike bonuses) rolls a TIER from the voyage's chosen
// duration, then merges into the per-tier hold. Clears the voyage + board.
async function finishDig(buyerId, board) {
    const row = await readRow(buyerId);
    const level = decorate(row).level;
    const quality = row?.voyage_quality || "standard";
    const rarityLevel = row?.rarity_level || 0;
    const found = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
    const earned = found + (board.bonus || 0);
    const won = earned > 0;
    // Roll each earned shard's tier and merge into the current per-tier hold.
    const counts = { ...((row && typeof row.fragments_json === "object" && row.fragments_json) || {}) };
    const byTier = {};
    for (let i = 0; i < earned; i++) {
        const t = rollFragmentTier(quality, rarityLevel, level);
        byTier[t] = (byTier[t] || 0) + 1;
        counts[t] = (Number(counts[t]) || 0) + 1;
    }
    // NOTE: digging does NOT level the boat — but voyages_completed drives the EXCAVATION level (tool unlocks).
    await db.query(
        `UPDATE mkt_sailing
            SET dig_state = NULL, departed_at = NULL, returns_at = NULL, voyage_quality = NULL,
                fragments_json = $2::jsonb, voyages_completed = voyages_completed + 1, updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(counts)]
    ).catch(() => {});
    const state = await getSailingState(buyerId);
    // byTier decorated with art/label so the recap can show what kind of shards you hauled up.
    const haul = Object.entries(byTier).map(([tier, n]) => {
        const c = CHEST_TIERS[tier] || {};
        return { tier, n, name: (c.label || tier).replace(" Chest", ""), emoji: c.emoji || "🎁", color: c.color || "#b08a52", art: fragmentArt(tier) };
    }).sort((a, b) => CHEST_ORDER.indexOf(b.tier) - CHEST_ORDER.indexOf(a.tier));
    return { ok: true, result: { won, earned, buried: board.frag.length, bonus: board.bonus || 0, haul }, ...state };
}
async function persistDig(buyerId, board) {
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

export async function digAt(buyerId, r, c) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    applyDig(board, Number(r), Number(c));
    return (board.status === "won" || board.status === "lost") ? finishDig(buyerId, board) : persistDig(buyerId, board);
}

// Use an unlocked area-clear tool at (r,c).
export async function activateTool(buyerId, toolId, r, c) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    const res = applyTool(board, String(toolId), Number(r), Number(c));
    if (!res.ok) return { ok: false, error: "cant_use_tool", ...(await getSailingState(buyerId)) };
    return (board.status === "won" || board.status === "lost") ? finishDig(buyerId, board) : persistDig(buyerId, board);
}

// The four boat upgrade tracks → their DB columns + level caps. Fortune lives in the legacy luck_level column;
// the "Luck" (early-find) lever lives in find_level.
const UPGRADE_COLS = {
    speed: "speed_level", fortune: "luck_level", rarity: "rarity_level", luck: "find_level",
    // Digging tracks (separate system):
    dig_stamina: "dig_stamina_level", dig_pierce: "dig_pierce_level", dig_strike: "dig_strike_level",
    dig_efficient: "dig_efficient_level", dig_detonator: "dig_detonator_level",
};
const UPGRADE_MAX = {
    speed: MAX_SPEED_LEVEL, fortune: MAX_FORTUNE_LEVEL, rarity: MAX_RARITY_LEVEL, luck: MAX_LUCK_LEVEL,
    dig_stamina: DIG_TRACKS.stamina.max, dig_pierce: DIG_TRACKS.pierce.max, dig_strike: DIG_TRACKS.strike.max,
    dig_efficient: DIG_TRACKS.efficient.max, dig_detonator: DIG_TRACKS.detonator.max,
};

async function buyUpgrade(buyerId, kind) {
    const col = UPGRADE_COLS[kind];
    if (!col) return { ok: false, error: "bad_upgrade", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    const cur = row?.[col] || 0;
    if (cur >= UPGRADE_MAX[kind]) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = upgradeCost(cur);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await db.query(`UPDATE mkt_sailing SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}
export const upgradeSpeed = (buyerId) => buyUpgrade(buyerId, "speed");
export const upgradeFortune = (buyerId) => buyUpgrade(buyerId, "fortune");
export const upgradeRarity = (buyerId) => buyUpgrade(buyerId, "rarity");
export const upgradeLuck = (buyerId) => buyUpgrade(buyerId, "luck"); // the "Luck" (early-find) lever
export const upgradeDig = (buyerId, track) => buyUpgrade(buyerId, `dig_${track}`); // digging tracks
