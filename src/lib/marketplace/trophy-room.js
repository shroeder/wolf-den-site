// ── THE TROPHY ROOM ──────────────────────────────────────────────────────────────────────────────────────────
// A room in your farm where everything you have ever done hangs on the wall. Each wall object is one SUBSYSTEM;
// tapping it opens what you have built there (your upgrade levels) and what you have done there (your lifetime
// records), each record carrying where you stand against everyone else who has played it.
//
// TWO RULES THIS FILE EXISTS TO KEEP:
//
// 1. NOTHING HERE RESTATES A CAP. Every track's max, name and icon is imported from the module that owns it —
//    MINE_TRACKS, COOK_TRACKS, DELVE_TRACKS, FISH_TRACKS, COMBAT_TRACKS, ARENA_UPGRADES, FORGE_UPGRADES,
//    FARM_UPGRADES, DIG_TRACKS. Retune Gunnery's max in ship-battle.js and this room follows on the next load.
//    A copied "max: 8" here would quietly run a second, wrong game — see the balance-constants rule.
//
// 2. "EVERYONE ELSE" MEANS WHAT THE ARENA BOARD MEANS. Eligibility is `COALESCE(xp,0) > 0`, lifted from
//    arena.js `standings()`. Two definitions of "a member" would put you 4th here and 6th there for the same
//    fight, and the player would be right to believe neither.
//
// Standing is computed over people who have ACTUALLY DONE the thing (value > 0), not over all 98 members.
// "1st of 98" for a stat 95 of them have never touched is a participation medal; "3rd of 27 who have fished"
// is a real place. Where nobody else has any, the record still shows — it just has no rank to report.
import { db } from "@/lib/db.js";
import { ARENA_UPGRADES } from "@/lib/marketplace/arena-upgrades.js";
import { COMBAT_TRACKS } from "@/lib/marketplace/ship-battle.js";
import { MINE_TRACKS, SMELT_TRACKS, SURVEY_TRACKS } from "@/lib/marketplace/mining.js";
import { COOK_TRACKS, TRACK_COL as COOK_TRACK_COL, trackValue as cookValue } from "@/lib/marketplace/cooking.js";
import { FISH_TRACKS, FISH_TRACK_COL, fishTrackValue } from "@/lib/marketplace/fishing.js";
import { DELVE_TRACKS } from "@/lib/marketplace/delve-catalog.js";
import { FORGE_UPGRADES } from "@/lib/marketplace/crafting.js";
import { FARM_UPGRADES } from "@/lib/marketplace/farm-crops.js";
import {
    DIG_TRACKS, MAX_LUCK_LEVEL, MAX_RAID_LEVEL, MAX_RARITY_LEVEL, MAX_SPEED_LEVEL,
} from "@/lib/marketplace/sailing.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { rankForLevel } from "@/lib/marketplace/ranks.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";

// ── SHELF HELPERS ────────────────────────────────────────────────────────────────────────────────────────────
// `tool` = a thing you have UPGRADED. `rec` = a thing you have DONE. Both are declarative so the loader can
// walk every shelf without knowing what a Bellows is.
const tool = (name, col, max, extra = {}) => ({ name, col, max, ...extra });
const rec = (label, col, extra = {}) => ({ label, col, ...extra });

// ── A RATE NEEDS A SAMPLE BEFORE IT MEANS ANYTHING ───────────────────────────────────────────────────────────
// Ranking win rate raw put a 58.1% off 93 fights at 25th of 27, because the four rates above it were 100% from
// one, two, one and thirteen fights. That is not a leaderboard, it is a list of people who stopped early — and
// the member reading it has just been told he is nearly last at the thing he is second-best at.
// So a rate only enters the ranking once there is a real sample behind it, on BOTH sides: peers below the bar
// are excluded from the field, and below the bar yourself you get the number with no place attached.
const RATE_MIN = 10;

// Turn a module's own track map into tools. `colOf` bridges the two shapes in use: most tracks carry their own
// `col`, cooking and fishing keep a separate key→column map. `fx` renders the live effect at a given level and
// is ALWAYS the owning module's own value function — never arithmetic repeated here.
const tracksToTools = (tracks, colOf = (k, t) => t.col || k, fx = null) =>
    Object.entries(tracks).map(([k, t]) => tool(t.name || k, colOf(k, t), t.max, {
        icon: t.icon || null, desc: t.desc || null, effect: t.effect || null,
        fx: fx ? (lvl) => fx(k, lvl) : null,
    }));

// ── THE ONE PLACE PROSE IS DUPLICATED, AND WHY ───────────────────────────────────────────────────────────────
// Every other subsystem keeps its `desc` on the track definition, so this room imports it and the two screens
// can never drift. Sailing and digging keep theirs as JSX inside SailingClient (with <b> tags), which cannot be
// imported into a server module. Rather than move a live screen's copy under this feature, the nine lines are
// restated here as plain text. IF YOU EDIT THE SAILING UPGRADE CARDS, EDIT THESE TOO — they are prose, not
// balance constants, so a drift is a wrong sentence rather than a wrong game, but it is still a drift.
const SAIL_DESC = {
    speed_level: "Faster voyages — shaves time off every trip, per level.",
    luck_level: "Draws trouble — raises the chance of a marine encounter at your voyage's midpoint.",
    rarity_level: "Better loot — a chance your forged chest is bumped up a tier.",
    raid_level: "Sharper raiding — a stronger hand when you go after another captain.",
};
const DIG_DESC = {
    stamina: "More digs each trip — one more per level.",
    pierce: "Chance a dig breaks through every layer of a tile at once.",
    strike: "Chance a dig strikes a lucky bonus — doubloons on top of whatever you unearth.",
    efficient: "Adds to every tool's proc chance while you dig.",
    detonator: "Chance a dig spawns an explosion, clearing a 3x3 one layer deep.",
};

// Fishing states its own `kind` per track, so rendering BY that kind is reading the module's declaration
// rather than re-deriving it: a "count" track adds whole casts, a "pct" track adds a chance.
const fishFx = (k, v) => (FISH_TRACKS[k]?.kind === "count" ? `+${Math.round(v)}` : `+${Math.round(v * 100)}%`);

// Tracks whose level lives inside a JSON blob rather than its own column.
const jsonTools = (defs, jsonCol) =>
    Object.entries(defs).map(([k, d]) => tool(d.name || k, `${jsonCol}.${k}`, d.max, { desc: d.desc || null }));

// ── WHAT EACH RECORD ACTUALLY COUNTS ─────────────────────────────────────────────────────────────────────────
// Keyed by label, and deliberately not exhaustive: "Bouts won" and "Fish landed" explain themselves, and a
// gloss under every single row buries the ones that need it. These are the rows a member cannot decode from
// the name — currencies, bests, and anything whose unit is not obvious. Luke, looking at the live screen:
// "This is cool, but I need it to tell me what everything actually is."
const RECORD_HINT = {
    "Victory points": "Your arena standing. An accrued total won off members above you — not a rung you hold.",
    "Best VP held": "The most victory points you have ever held at once.",
    "Laurels earned": "The arena's own currency, paid for fighting and spent on its upgrade tracks.",
    "Ladder rungs beaten": "How far up the NPC ladder you have cleared.",
    "Best ladder rung": "The highest rung you have ever put down.",
    "Toughest NPC felled": "The hardest ladder opponent you have beaten.",
    "Arena XP": "Experience earned inside the ring specifically, separate from your account level.",
    "Win rate": "The share of your fights you won. Needs 10 fights before it earns a placing.",
    "Deepest fleet run": "The furthest through an enemy fleet you have fought before going down.",
    "Doubloons held": "Ship-battle currency, spent on shot and repairs.",
    "Encounters fought": "Ships met mid-voyage, won or lost.",
    "Raids defended": "Times another captain came for your hold and failed.",
    "Waves ridden": "Passing sailors greeted at sea for XP and coin.",
    "Wind recharges": "Times you paid to refill the wind and sail again the same day.",
    "Boat XP": "Experience the boat itself has earned — what raises its form.",
    // Renamed with the column's meaning. It counted fuse-ten-fragments assemblies, was written by nothing
    // after that screen was removed, and so read zero for all 76 diggers. It counts chests DUG now.
    "Chests found": "Treasure chests you have taken out of the sand — one for every dig you have finished.",
    "Chest points": "Chest value banked, weighted by tier. This is what unlocks the dig tools.",
    "Fragments held": "Shards left over when fragments were retired. They were paid out as chests and doubloons.",
    "Line recharges": "Times you paid for more casts after the day's ran out.",
    "Best combo": "The longest unbroken run of good swings in a single descent.",
    "Best read streak": "The longest run of correctly read seams while surveying.",
    "Masterwork runs": "Descents finished at the top grade.",
    "Emberheart cracked": "The rarest seam in the mine, opened.",
    "Flawless pours": "Smelts poured without a single mistake.",
    "Steps underground": "Every step you have ever taken into the dark.",
    "Deepest floor": "The furthest down you have reached in any single delve.",
    "Clear rate": "The share of your delves you walked out of. Needs 10 runs before it earns a placing.",
    "Best dish tier": "The highest tier of recipe you have successfully cooked.",
    "Best quality": "The best quality grade any dish of yours has come out at.",
    "Best chain": "Your longest run of cooks without a failure.",
    "Preps done": "Ingredients prepared ahead of a cook.",
    "Pieces salvaged": "Gear broken down into parts at the forge.",
    "Parts combined": "Parts fused together into higher-tier parts.",
    "Enhancements made": "Times you have enhanced a piece of gear.",
    "Gems cut": "Gems produced at the Jewelcutter.",
    "Pet levels earned": "Every level across every pet you keep, added together.",
    "Decorations owned": "Every decoration in your possession, placed or not.",
    "Farm love": "Your farm's rating score — an Admire counts triple a Like, a Love double.",
    "Ratings received": "How many members have rated your farm at all.",
    "Collections completed": "Full sets finished in the compendium.",
    "Cheers given": "Hype you have sent members fighting a boss.",
    "Cheers received": "Hype other members have sent you.",
    "Bosses struck": "Every blow you have landed on a world boss.",
    "Mystery bags opened": "Mystery bags bought and opened in the shop.",
    "Quests completed": "Daily quests you finished AND collected.",
};

// ── WHAT THE SUBSYSTEM ACTUALLY IS ───────────────────────────────────────────────────────────────────────────
// `blurb` is the object on the wall talking ("Blades on the rack") — flavour, and it earns its place. It is not
// an explanation, and a member who has never opened the Arena learns nothing from it. `what` is the plain
// version: how the system works in two sentences, for somebody standing in front of a wall they have never
// touched. `href`/`cta` finish the thought — having just explained the thing, send them to it.
//
// These are prose, not balance constants, so they are written here rather than imported: the owning modules
// state their tracks' effects (which this room does import), not what the feature is for.
const ABOUT = {
    arena: {
        what: "One-on-one bouts against other members' heroes, fought on a timer off the gear you are wearing. "
            + "Challenging is free — a win takes victory points off whoever you beat and pays laurels, which is "
            + "the currency the tracks below are bought with.",
        href: "/marketplace/arena", cta: "Go to the Arena",
    },
    ships: {
        what: "Your boat against another, broadside by broadside. You aim at a part of her ship — hull, guns or "
            + "rigging — and the whole volley goes there, so what you cripple first decides the fight.",
        href: "/marketplace/sailing", cta: "Go to the docks",
    },
    sailing: {
        what: "Send the boat out and it sails whether the tab is open or not, meeting whatever is on the water "
            + "at the midpoint of the trip and coming home loaded. The upgrades below shorten the trip, sweeten "
            + "the hold and decide how much trouble it finds.",
        href: "/marketplace/sailing", cta: "Set sail",
    },
    digging: {
        what: "A patch of sand uncovered one tile at a time, with a limited number of digs per trip. There is a "
            + "real chest down there — uncover all of it and it is yours, at whatever tier was buried. Run out of "
            + "light part-way and you keep doubloons for the dirt you shifted.",
        href: "/marketplace/sailing", cta: "Go and dig",
    },
    fishing: {
        what: "Free casts, refreshed daily. Every fish is worth gold and the rare ones are worth showing off — "
            + "the tracks below buy more casts a day and better odds on what takes the line.",
        href: "/marketplace/fishing", cta: "Go fishing",
    },
    mining: {
        what: "Read the seam, then swing on the beat — a clean run of swings builds a combo that pays out at the "
            + "end. Ore comes back up and is smelted into the parts the forge builds with.",
        href: "/marketplace/mining", cta: "Head down the mine",
    },
    delves: {
        what: "A run of floors that gets harder the deeper you take it, with one flask between you and the "
            + "bottom. Walk out and you keep the run; die and you keep nothing from it.",
        href: "/marketplace/dungeons", cta: "Open a dungeon",
    },
    kitchen: {
        what: "A timing minigame that turns what the farm grows into dishes. A dish is a buff you eat before a "
            + "boss night or a hard delve, and the better you hit the band the better it comes out.",
        href: "/marketplace/cooking", cta: "Go to the kitchen",
    },
    forge: {
        what: "Gear you will never wear is salvaged into parts, parts combine upward into rarer parts, and those "
            + "enhance a piece you are keeping. The Jewelcutter next to it cuts gems for the sockets.",
        href: "/marketplace/blacksmith", cta: "Go to the forge",
    },
    farm: {
        what: "Crops grow on a real clock whether you are here or not, pets earn while they roam it, and other "
            + "members can walk in and rate what you have built. You are standing in it.",
        href: "/marketplace/farm", cta: "Look around the farm",
    },
    den: {
        what: "Everything that is not one single system — the level and gold everything else feeds, the badges "
            + "you have been awarded, and the things you have done for other members.",
        href: "/marketplace/play", cta: "Back to the Den",
    },
};

// ── THE WALL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Order is hanging order, and it is deliberate: the things you fight with first, then the things you make with,
// then the life you have lived. `src` names which row the loader reads.
const WALLS = [
    {
        key: "arena", name: "The Arena", src: "arena", art: "/images/trophy/tool-arena.webp",
        blurb: "Blades on the rack. What you have taken off other members.",
        tools: ARENA_UPGRADES.map((u) => tool(u.name, `upgrades.${u.id}`, u.max, {
            icon: u.icon, desc: u.desc,
            // The track's OWN unit formatter, fed its own per-level value. Nothing about the maths lives here.
            fx: (lvl) => (lvl > 0 && u.unit ? u.unit(u.per * lvl) : null),
        })),
        records: [
            rec("Bouts won", "wins", { rank: true }),
            rec("Bouts lost", "losses"),
            rec("Win rate", "winRate", { rank: true, kind: "pct", needs: "fights", minSample: RATE_MIN }),
            rec("Victory points", "vp", { rank: true }),
            rec("Best VP held", "best_vp"),
            rec("Best win streak", "best_streak", { rank: true }),
            rec("Current streak", "streak"),
            rec("Laurels earned", "laurels_earned", { rank: true }),
            // ── TWO ROAD RECORDS NOW, AND ONLY ONE OF THEM SURVIVES A SEASON ────────────────────────
            // The Road resets every season, so `ladder_beaten` — which is this season's set — empties for
            // everybody the day a season turns over. A wall of trophies that goes blank on a schedule is not
            // a record of anything, and the member with the longest climb in the Den would find their name
            // gone from it. So the RANKED record is the lifetime high-water mark, which only ever goes up.
            rec("Furthest rung ever", "road_best_rung", { rank: true }),
            rec("Rungs beaten this season", "ladder_beaten"),
            rec("Toughest NPC felled", "npc_best", { rank: true }),
            rec("Arena XP", "arena_xp", { rank: true }),
        ],
    },
    {
        key: "ships", name: "Ship Battles", src: "sailing", art: "/images/trophy/tool-ships.webp",
        blurb: "The wheel off a ship that lost. Broadsides given and taken.",
        tools: tracksToTools(COMBAT_TRACKS),
        records: [
            rec("Ship fights won", "fleet_wins", { rank: true }),
            rec("Ship fights lost", "fleet_losses"),
            rec("Win rate", "fleetRate", { rank: true, kind: "pct", needs: "fleetFights", minSample: RATE_MIN }),
            rec("Deepest fleet run", "fleet_best", { rank: true }),
            rec("Fleets sailed", "fleet_count"),
            rec("Doubloons held", "doubloons", { rank: true }),
            rec("Encounters fought", "encounters_fought", { rank: true }),
            rec("Encounters won", "encounters_won", { rank: true }),
            rec("Raids won", "raids_won", { rank: true }),
            rec("Raids defended", "raids_defended", { rank: true }),
        ],
    },
    {
        key: "sailing", name: "The Voyage", src: "sailing", art: "/images/trophy/tool-sailing.webp",
        blurb: "A charted map and a brass glass. Everywhere the boat has been.",
        tools: [
            tool("Speed", "speed_level", MAX_SPEED_LEVEL, { desc: SAIL_DESC.speed_level }),
            tool("Fortune", "luck_level", MAX_LUCK_LEVEL, { desc: SAIL_DESC.luck_level }),
            tool("Rarity", "rarity_level", MAX_RARITY_LEVEL, { desc: SAIL_DESC.rarity_level }),
            tool("Raiding", "raid_level", MAX_RAID_LEVEL, { desc: SAIL_DESC.raid_level }),
        ],
        records: [
            rec("Voyages completed", "voyages_completed", { rank: true }),
            rec("Waves ridden", "waves_total", { rank: true }),
            rec("Encounters met", "encounters_total"),
            rec("Merchants met", "merchant_encounters"),
            rec("Wind recharges", "wind_recharges"),
            rec("Boat XP", "boat_xp", { rank: true }),
        ],
    },
    {
        key: "digging", name: "Digging", src: "sailing", art: "/images/trophy/tool-digging.webp",
        blurb: "A worn shovel and a sieve. Everything you pulled out of the sand.",
        tools: [
            ...Object.entries(DIG_TRACKS).map(([k, t]) => tool(k[0].toUpperCase() + k.slice(1), `dig_${k}_level`, t.max, { desc: DIG_DESC[k] })),
            tool("Deep charge", "dig_tool_levels.deep", 3, { desc: "A charge that clears deeper — more layers in one blast." }),
            tool("Wide charge", "dig_tool_levels.wide", 3, { desc: "A charge that clears wider — a bigger patch in one blast." }),
        ],
        records: [
            // Both of these are now HISTORICAL — nothing increments them since chests became something you
            // dig up whole. Left on the wall on purpose: they are a record of what people did, and deleting a
            // stat quietly rewrites everyone's history. The copy above says so rather than implying they are live.
            rec("Chests found", "chests_forged", { rank: true }),
            rec("Chest points", "chest_points", { rank: true }),
        ],
    },
    {
        key: "fishing", name: "Fishing", src: "sailing", art: "/images/trophy/tool-fishing.webp",
        blurb: "Rod, net and gaff. The ones that did not get away.",
        tools: tracksToTools(FISH_TRACKS, (k) => FISH_TRACK_COL[k],
            (k, lvl) => (lvl > 0 ? fishFx(k, fishTrackValue(k, lvl)) : null)),
        records: [
            rec("Fish landed", "fish_caught", { rank: true }),
            rec("Casts made", "fish_casts"),
            rec("Line recharges", "fish_recharges"),
        ],
    },
    {
        key: "mining", name: "The Mine", src: "mining", art: "/images/trophy/tool-mining.webp",
        blurb: "A pick, a lantern and a slag heap. Everything you cut out of the rock.",
        tools: [...tracksToTools(MINE_TRACKS), ...tracksToTools(SURVEY_TRACKS), ...tracksToTools(SMELT_TRACKS)],
        records: [
            rec("Nodes mined", "nodes_mined", { rank: true }),
            rec("Ore hauled", "ore_total", { rank: true }),
            rec("Ore smelted", "ore_smelted", { rank: true }),
            rec("Best combo", "best_combo", { rank: true }),
            rec("Best read streak", "best_streak", { rank: true }),
            rec("Masterwork runs", "masterwork_runs", { rank: true }),
            rec("Emberheart cracked", "emberheart_cracked", { rank: true }),
            rec("Flawless pours", "flawless_pours", { rank: true }),
            rec("Pours made", "smelts_poured"),
            rec("Steps underground", "steps_taken"),
        ],
    },
    {
        key: "delves", name: "The Delve", src: "delve", art: "/images/trophy/tool-delves.webp",
        blurb: "A warded cloak and an empty flask. How deep you went, and what came back.",
        tools: tracksToTools(DELVE_TRACKS, undefined, (k, lvl) => DELVE_TRACKS[k].fmt(lvl)),
        records: [
            rec("Deepest floor", "deepest_floor", { rank: true }),
            rec("Runs cleared", "runs_cleared", { rank: true }),
            rec("Floors cleared", "floors_cleared", { rank: true }),
            rec("Bosses felled", "bosses_felled", { rank: true }),
            rec("Runs started", "runs_started"),
            rec("Runs that killed you", "runs_died"),
            rec("Clear rate", "delveRate", { rank: true, kind: "pct", needs: "runs_started", minSample: RATE_MIN }),
        ],
    },
    {
        key: "kitchen", name: "The Kitchen", src: "kitchen", art: "/images/trophy/tool-kitchen.webp",
        blurb: "Copper pots and a worn board. Everything you have cooked for the hall.",
        tools: tracksToTools(COOK_TRACKS, (k) => COOK_TRACK_COL[k],
            (k, lvl) => (lvl > 0 ? `+${Math.round(cookValue(k, lvl) * 100)}%` : null)),
        records: [
            rec("Dishes cooked", "cooks_total", { rank: true }),
            rec("Cooking XP", "cook_xp", { rank: true }),
            rec("Best dish tier", "best_dish_tier", { rank: true }),
            rec("Best quality", "best_quality", { rank: true }),
            rec("Best chain", "best_chain", { rank: true }),
            rec("Preps done", "preps_total"),
        ],
    },
    {
        key: "forge", name: "The Forge", src: "forge", art: "/images/trophy/tool-forge.webp",
        blurb: "Hammer, tongs and a bin of scrap. What you have broken down and built up.",
        tools: Object.entries(FORGE_UPGRADES).map(([k, u]) => tool(u.name, k, u.max, {
            desc: u.desc, fx: (lvl) => (lvl > 0 ? `${(u.per * lvl * 100).toFixed(1)}${u.unit || ""}` : null),
        })),
        records: [
            rec("Pieces salvaged", "salvaged", { rank: true }),
            rec("Parts combined", "combined", { rank: true }),
            rec("Enhancements made", "enhanced", { rank: true }),
            rec("Gems cut", "gems_cut", { rank: true }),
        ],
    },
    {
        key: "farm", name: "The Farm", src: "farm", art: "/images/trophy/tool-farm.webp",
        blurb: "A scythe and a seed tin. The ground you work and the beasts you keep.",
        tools: jsonTools(FARM_UPGRADES, "farm_upgrades"),  // FARM_UPGRADES carries its own desc
        records: [
            rec("Crops harvested", "harvests", { rank: true }),
            rec("Pets kept", "pets", { rank: true }),
            rec("Pet levels earned", "pet_levels", { rank: true }),
            rec("Decorations owned", "deco_total", { rank: true }),
            rec("Farm love", "love", { rank: true }),
            rec("Ratings received", "votes", { rank: true }),
        ],
    },
    {
        key: "den", name: "The Den", src: "den", art: "/images/trophy/tool-den.webp",
        blurb: "The wolf's head over the hearth. Everything else you have done here.",
        tools: [],
        records: [
            rec("Level", "level", { rank: true }),
            rec("Total XP", "xp", { rank: true }),
            rec("Gold in hand", "gold", { rank: true }),
            rec("Badges earned", "badges", { rank: true }),
            rec("Collections completed", "collections", { rank: true }),
            rec("Login streak", "login_streak", { rank: true }),
            rec("Cheers given", "cheers_given", { rank: true }),
            rec("Cheers received", "cheers_received", { rank: true }),
            rec("Mystery bags opened", "mystery_bags_bought", { rank: true }),
            rec("Spins taken", "spin_count", { rank: true }),
            rec("Quests completed", "quests", { rank: true }),
            rec("Bosses struck", "boss_hits", { rank: true }),
        ],
    },
];

// The wall with its prose folded in. ABOUT is written as its own block above only so the eleven explanations
// read together — this is the single export, so the loader, the lab and anything else all see one shape and
// nobody has to remember to merge the two halves a second time.
export const SHELVES = WALLS.map((sh) => ({ ...sh, ...(ABOUT[sh.key] || {}) }));

// Read a column that may be a dotted path into a JSON column ("upgrades.edge", "farm_upgrades.plots").
function readCol(row, col) {
    if (!row) return 0;
    if (!col.includes(".")) return Number(row[col]) || 0;
    const [outer, inner] = col.split(".");
    const blob = row[outer];
    const obj = typeof blob === "string" ? safeJson(blob) : blob;
    return Number(obj?.[inner]) || 0;
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

// Derived records — the ones that are a ratio of two columns rather than a column. `needs` names the
// denominator so a member with no attempts is left out of the ranking entirely instead of ranking at 0%.
function derive(row, key) {
    const n = (c) => Number(row?.[c]) || 0;
    if (key === "winRate") return n("wins") + n("losses") ? n("wins") / (n("wins") + n("losses")) : null;
    if (key === "fights") return n("wins") + n("losses");
    if (key === "fleetRate") return n("fleet_wins") + n("fleet_losses") ? n("fleet_wins") / (n("fleet_wins") + n("fleet_losses")) : null;
    if (key === "fleetFights") return n("fleet_wins") + n("fleet_losses");
    if (key === "delveRate") return n("runs_started") ? n("runs_cleared") / n("runs_started") : null;
    // `ladder_beaten` is the SET of rungs taken, not a count — Number([1,2,3]) is NaN, which readCol turned into
    // a 0 and hung on the wall of every member who had walked the Road. Its length is the number of rungs. The
    // `best_rung` column that used to sit beside it is gone: nothing has ever written it, so it ranked a field
    // of zeroes, and the highest rung is this array's max anyway — which on a Road you climb in order is its
    // length. One honest record beats two, one of them dead.
    // Now THIS SEASON's count. `road_best_rung` is the lifetime figure and is a plain int column, so it needs
    // no derivation — see the two records above, and the season rollover in arena.js that clears this array.
    if (key === "ladder_beaten") return Array.isArray(row?.ladder_beaten) ? row.ladder_beaten.length : 0;
    return null;
}

const valueOf = (row, r) => {
    const d = derive(row, r.col);
    return d !== null ? d : readCol(row, r.col);
};

/**
 * Everything the trophy room needs, for one member.
 *
 * One pass over every eligible member's rows — ~440 rows across six tables at present — then all ranking is
 * done in memory. That is deliberately not a dozen window-function queries: the ranking rule lives in ONE
 * place here, so "3rd of 27" can never disagree with itself between two shelves.
 */
export async function trophyRoom(buyerId) {
    if (!buyerId) return null;

    const [members, arena, sailing, mining, delve, kitchen, forge, farm, den] = await Promise.all([
        db.query(`SELECT id, xp, gold, login_streak, cheers_given, cheers_received, mystery_bags_bought,
                         spin_count, farm_upgrades
                    FROM mkt_buyer WHERE COALESCE(xp,0) > 0`).catch(() => []),
        db.query(`SELECT * FROM mkt_arena`).catch(() => []),
        db.query(`SELECT * FROM mkt_sailing`).catch(() => []),
        db.query(`SELECT * FROM mkt_mining`).catch(() => []),
        db.query(`SELECT * FROM mkt_delve`).catch(() => []),
        db.query(`SELECT * FROM mkt_kitchen`).catch(() => []),
        // The forge keeps one ROW PER TRACK, and its records live in the craft-event log rather than a counter.
        db.query(`SELECT buyer_id, key, level FROM mkt_forge_upgrade`).catch(() => []),
        farmAggregates(),
        denAggregates(),
    ]);

    const eligible = new Set(members.map((m) => m.id));
    const byId = (rows, key = "buyer_id") => {
        const m = new Map();
        for (const r of rows) if (eligible.has(r[key])) m.set(r[key], r);
        return m;
    };

    // The forge's per-track rows collapse into one row-shaped object per member, so it reads like every other src.
    const forgeRows = new Map();
    for (const r of forge) {
        if (!eligible.has(r.buyer_id)) continue;
        const cur = forgeRows.get(r.buyer_id) || { buyer_id: r.buyer_id };
        cur[r.key] = Number(r.level) || 0;
        forgeRows.set(r.buyer_id, cur);
    }
    for (const [id, counts] of den.forgeCounts) {
        const cur = forgeRows.get(id) || { buyer_id: id };
        Object.assign(cur, counts);
        forgeRows.set(id, cur);
    }

    const SRC = {
        arena: byId(arena), sailing: byId(sailing), mining: byId(mining),
        delve: byId(delve), kitchen: byId(kitchen), forge: forgeRows,
        farm: farm.rows, den: den.rows,
    };

    const shelves = SHELVES.map((sh) => {
        const rows = SRC[sh.src] || new Map();
        const mine = rows.get(buyerId) || null;

        const tools = sh.tools.map((t) => {
            const level = readCol(mine, t.col);
            // What the level is WORTH right now, rendered by the owning module's own formatter. Wrapped
            // because a track's formatter is that module's business and must never take this room down.
            let now = null;
            try { now = t.fx ? t.fx(level) : null; } catch { now = null; }
            return {
                name: t.name, icon: t.icon || null, level, max: t.max,
                desc: t.desc || null,     // what the track does, in the owning module's own words
                effect: t.effect || null, // what axis it moves ("Swing power"), where the module names one
                now,                      // what you have bought so far ("+24 health")
            };
        });
        const built = tools.reduce((n, t) => n + t.level, 0);
        const buildable = tools.reduce((n, t) => n + t.max, 0);

        const records = sh.records.map((r) => {
            const mineVal = mine ? valueOf(mine, r) : 0;
            // Rank only among members who have done the thing. A null (no attempts) is not a zero.
            const mySample = r.needs && mine ? valueOf(mine, { col: r.needs }) : Infinity;
            const thin = r.minSample && mySample < r.minSample;

            let rank = null; let of = null;
            if (r.rank && !thin) {
                const peers = [];
                for (const [, row] of rows) {
                    const sample = r.needs ? valueOf(row, { col: r.needs }) : Infinity;
                    if (r.needs && !sample) continue;
                    if (r.minSample && sample < r.minSample) continue;
                    const v = valueOf(row, r);
                    if (v === null || v <= 0) continue;
                    peers.push(v);
                }
                if (peers.length) {
                    of = peers.length;
                    // Standard competition ranking: everyone strictly above you pushes you down one.
                    if (mineVal > 0) rank = 1 + peers.filter((v) => v > mineVal).length;
                }
            }
            return {
                label: r.label, kind: r.kind || "count",
                hint: RECORD_HINT[r.label] || null,
                value: mineVal === null ? 0 : mineVal,
                rank, of,
                // Below the bar we say WHY there is no place, rather than showing a blank and looking broken.
                note: thin ? `needs ${r.minSample} to be ranked` : null,
                pct: rank && of ? Math.round(((of - rank) / Math.max(1, of - 1)) * 100) : null,
            };
        }).filter((r) => r.value > 0 || r.of || r.note); // an untouched subsystem shows its wall object, not twelve zeroes

        const touched = built > 0 || records.some((r) => r.value > 0);

        // HOW BIG THE FIELD IS. "6th of 27" begs the question the room never answered: 27 out of how many? This
        // is the same test as `touched` above, run over everybody — anything bought or any record above zero —
        // so the number the modal reports is the field those placings are actually drawn from.
        let players = 0;
        for (const [, row] of rows) {
            if (sh.tools.some((t) => readCol(row, t.col) > 0)
                || sh.records.some((r) => (valueOf(row, r) || 0) > 0)) players += 1;
        }

        return {
            key: sh.key, name: sh.name, art: sh.art, blurb: sh.blurb,
            what: sh.what || null, href: sh.href || null, cta: sh.cta || null,
            tools, built, buildable, players,
            // A shelf's headline is its best placing — what the object on the wall is actually bragging about.
            best: records.filter((r) => r.rank).sort((a, b) => a.rank - b.rank)[0] || null,
            // A wall you have never touched hangs there empty. Listing nine zeroes under it would read as a
            // scorecard of everything you have failed to do, which is the opposite of a trophy room.
            records: touched ? records : [],
            touched,
        };
    });

    const meRow = den.rows.get(buyerId);
    const lvl = levelForXp(Number(meRow?.xp) || 0).level;

    // ── THE CURATOR'S BONUS ──────────────────────────────────────────────────────────────────────────────
    // How full the wall is, over EVERY upgrade track in the game, and the bonus XP that is currently paying.
    //
    // It counts the tools (things you bought levels in) and not the records (things you did), because only
    // the tools have a ceiling. A record has no denominator — "cooked 400 dishes" is not 4% of anything — so
    // folding them in would invent a completion figure out of numbers that cannot complete.
    //
    // Breadth is the whole point: one maxed track out of forty moves this barely, and a level in a system you
    // have never touched moves it exactly as much as a level in your best one. That is the behaviour worth
    // paying for — it is the room's own argument, that everything you have ever done hangs on one wall.
    const builtAll = shelves.reduce((n, s) => n + (s.built || 0), 0);
    const buildableAll = shelves.reduce((n, s) => n + (s.buildable || 0), 0);
    const curationPct = buildableAll > 0 ? Math.max(0, Math.min(100, Math.round((builtAll / buildableAll) * 100))) : 0;
    const bonusPct = curationBonusFor(curationPct);

    // Persisted so awardXp can read it for free — see the note in 381-trophy-curation.sql. Written on every
    // visit rather than on every upgrade, because the upgrades happen in nine different modules and a hook in
    // each of them is nine chances to forget one.
    await db.query(`UPDATE mkt_buyer SET trophy_pct = $2 WHERE id = $1 AND trophy_pct IS DISTINCT FROM $2`,
        [buyerId, curationPct]).catch(() => {});

    return {
        memberCount: eligible.size,
        level: lvl,
        rank: rankForLevel(lvl)?.title || null,
        shelves,
        // How many of the eleven walls you have actually touched — the room's one-line summary.
        touched: shelves.filter((s) => s.touched).length,
        total: shelves.length,
        curation: { pct: curationPct, built: builtAll, buildable: buildableAll, bonusPct, maxBonus: CURATION_MAX_PCT },
    };
}

// ── WHAT A FULL WALL IS WORTH ────────────────────────────────────────────────────────────────────────────────
// A standing % of BONUS XP, straight-line with how full the room is. XP only — gold is the tighter economy
// and the one that keeps needing walking back, so levels are the safe place to be generous. Deliberately
// linear and small: it sits on top of Happy Hour, the Town's prosperity, Market Day and the hangout buff,
// all of which multiply the same number, and the last thing this needs is a fifth multiplier that spikes.
//
// Straight-line rather than tiered on purpose. A tier would mean levels that pay nothing until the next
// threshold, which is the "N more until guaranteed" shape we do not ship — every single upgrade you buy
// anywhere in the game should move this, even if only by a fraction of a percent.
export const CURATION_MAX_PCT = 10;
export const curationBonusFor = (pct) =>
    Math.round(Math.max(0, Math.min(100, Number(pct) || 0)) * CURATION_MAX_PCT) / 100;

// ── THE TWO SHELVES WITH NO TABLE OF THEIR OWN ───────────────────────────────────────────────────────────────
// Farm and Den read off counts spread across a dozen tables. Both build a Map<buyerId, rowLikeObject> so the
// main loop can treat them exactly like mkt_arena.
async function farmAggregates() {
    const [harvests, petRows, decos, love, upg] = await Promise.all([
        // There is no lifetime harvest counter — mkt_farm_plot holds only what is in the ground right now.
        // The activity log is the record: one `harvest` row per crop pulled, 5,647 of them and counting.
        db.query(`SELECT buyer_id, count(*)::int v FROM mkt_xp_event WHERE action = 'harvest' GROUP BY buyer_id`).catch(() => []),
        // Pets store XP, not a level. petLevelForXp needs the pet's RARITY, so the rows come back raw and the
        // level is derived per pet exactly the way every other screen derives it.
        db.query(`SELECT buyer_id, pet_id, xp FROM mkt_pet_level`).catch(() => []),
        db.query(`SELECT buyer_id, count(*)::int kinds, COALESCE(SUM(qty),0)::int total FROM mkt_deco_owned GROUP BY buyer_id`).catch(() => []),
        // The SAME weighting farmLoveBoard ranks on (admire 3 · love 2 · like 1). A second formula here would
        // put you 2nd on the love board and 5th in your own trophy room off one set of votes.
        db.query(`SELECT owner_id AS buyer_id,
                         SUM(votes * CASE tier WHEN 3 THEN 3 WHEN 2 THEN 2 ELSE 1 END)::int score,
                         SUM(votes)::int votes
                    FROM mkt_farm_rating GROUP BY owner_id`).catch(() => []),
        db.query(`SELECT id AS buyer_id, farm_upgrades FROM mkt_buyer WHERE farm_upgrades IS NOT NULL`).catch(() => []),
    ]);
    const rows = new Map();
    const at = (id) => {
        const cur = rows.get(id) || { buyer_id: id };
        rows.set(id, cur);
        return cur;
    };
    for (const r of harvests) if (r.buyer_id) at(r.buyer_id).harvests = Number(r.v) || 0;
    for (const r of decos) if (r.buyer_id) { const c = at(r.buyer_id); c.decos = Number(r.kinds) || 0; c.deco_total = Number(r.total) || 0; }
    for (const r of love) if (r.buyer_id) { const c = at(r.buyer_id); c.love = Number(r.score) || 0; c.votes = Number(r.votes) || 0; }
    for (const r of upg) if (r.buyer_id) at(r.buyer_id).farm_upgrades = r.farm_upgrades;
    for (const r of petRows) {
        if (!r.buyer_id) continue;
        const c = at(r.buyer_id);
        c.pets = (c.pets || 0) + 1;
        c.pet_levels = (c.pet_levels || 0) + petLevelForXp(Number(r.xp) || 0, collectibleById(r.pet_id)?.rarity);
    }
    return { rows };
}

async function denAggregates() {
    const [buyers, badges, collections, quests, bossHits, craft, gems] = await Promise.all([
        db.query(`SELECT id AS buyer_id, xp, gold, login_streak, cheers_given, cheers_received,
                         mystery_bags_bought, spin_count
                    FROM mkt_buyer WHERE COALESCE(xp,0) > 0`).catch(() => []),
        db.query(`SELECT buyer_id, count(*)::int v FROM mkt_user_badge GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT buyer_id, count(*)::int v FROM mkt_user_collection GROUP BY buyer_id`).catch(() => []),
        // A quest is DONE when it has been claimed — there is no `done` flag. (1,471 have met their target;
        // 1,230 were actually collected. The claimed number is the one that means "I did that".)
        db.query(`SELECT buyer_id, count(*)::int v FROM mkt_daily_quest WHERE claimed_at IS NOT NULL GROUP BY buyer_id`).catch(() => []),
        // One row per member per boss per DAY, carrying `n` swings — so this counts rows, not blows.
        db.query(`SELECT buyer_id, COALESCE(SUM(n),0)::int v FROM mkt_boss_swing GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT buyer_id, action, count(*)::int v FROM mkt_craft_event GROUP BY buyer_id, action`).catch(() => []),
        db.query(`SELECT buyer_id, COALESCE(SUM(count),0)::int v FROM mkt_gem GROUP BY buyer_id`).catch(() => []),
    ]);
    const rows = new Map();
    for (const b of buyers) {
        rows.set(b.buyer_id, {
            ...b,
            level: levelForXp(Number(b.xp) || 0).level,
            badges: 0, collections: 0, quests: 0, boss_hits: 0,
        });
    }
    const put = (list, field) => {
        for (const r of list || []) {
            const cur = rows.get(r.buyer_id);
            if (cur) cur[field] = Number(r.v) || 0;
        }
    };
    put(badges, "badges"); put(collections, "collections"); put(quests, "quests"); put(bossHits, "boss_hits");

    // The forge's RECORDS: mkt_craft_event is one row per action, keyed by kind.
    const forgeCounts = new Map();
    const bump = (id, field, v) => {
        const cur = forgeCounts.get(id) || {};
        cur[field] = (cur[field] || 0) + v;
        forgeCounts.set(id, cur);
    };
    const CRAFT_FIELD = { salvage: "salvaged", combine: "combined", enhance: "enhanced" };
    for (const r of craft) {
        const field = CRAFT_FIELD[r.action];
        if (field) bump(r.buyer_id, field, Number(r.v) || 0);
    }
    for (const r of gems) bump(r.buyer_id, "gems_cut", Number(r.v) || 0);

    return { rows, forgeCounts };
}
