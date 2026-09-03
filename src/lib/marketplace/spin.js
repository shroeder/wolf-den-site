import "server-only";

import { db } from "@/lib/db";
import { hasUnlock } from "@/lib/marketplace/casino-perks.js";
import { dropSeedFrom, grantSeed, SEEDS } from "@/lib/marketplace/farm-crops.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { grantItem, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { itemById, describeStats } from "@/lib/marketplace/items.js";
import { pieceById } from "@/lib/marketplace/collection-pieces.js";
import { getOwnedPieceIds, getOwnedSetIds, grantPiece } from "@/lib/marketplace/collection-owned.js";
import { setWheelBonus, setWheelRespinChance } from "@/lib/marketplace/sets.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { activeXpMultiplier } from "@/lib/marketplace/happy-hour-core.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { addParts } from "@/lib/marketplace/crafting.js";
import { partName, partSprite } from "@/lib/marketplace/forge-parts.js";
import { equippedPowers, claimPowerUse } from "@/lib/marketplace/ascension-powers.js";
import { mint } from "@/lib/marketplace/gold-rate.js";

// DAILY SPIN — one free spin a day + a spin-token economy. Tokens come from quests, boss kills, streaks, or
// gold. Your level unlocks better wheels. Gold prizes ride the Happy Hour multiplier. The wheel's prize list
// is ordered + stable so the UI can rotate to the winning index.
//
// NO PITY COUNTER. There used to be one — "Lucky Charge", a 1-of-20 bar under the wheel that guaranteed a
// rare on the twentieth spin. It was removed at Luke's call, and the reason is worth keeping: a progress bar
// toward a guaranteed win tells you before you tap that this spin does not matter, and the nineteen spins it
// counts are strictly worse for having been counted. Every spin is now the same honest roll off the wheel's
// own weights. `spins_since_rare` is left on mkt_buyer as dead data rather than dropped — nothing reads it.

// What the old chest-shard wedge pays now, by the tier it used to give. A ship battle pays ~12, so the
// wooden wedge is a small trickle and the gold wedge is a real prize.
const SPIN_DOUBLOONS_BY_TIER = { wooden: 5, iron: 10, gold: 18, mythic: 30 };

export const SPIN_TOKEN_COST = 400; // gold to buy one extra spin
// Wheelwarden set "Lucky Spin" proc payout (the set only grants a CHANCE at this per spin, not every spin).
// Bumped from 25 when the pity burst went away — the proc lost half its payload and this is all it does now.
const LUCKY_GOLD_PCT = 40; // % bonus gold when a Lucky Spin lands on a gold prize

// The wheel carries a MINI JACKPOT + a grand JACKPOT, both weighted tiny so they're a rare thrill
// (jackpot ≈ 0.8%, mini ≈ 2.5%). `tier` drives the wheel/legend styling client-side. Single wheel for
// everyone (the old bronze/silver/gold tiers were collapsed to one). The 🌱 Common Seed wedge is live now
// that the farm is public (grantSeed/SEEDS handler wired below).
// Prize sprite path (real AI art, no emoji) — public/images/spin/prizes/<name>.png. An absolute path passes
// straight through, so a wedge can borrow art from another feature (e.g. the sailing fragment sprites).
const P = (name) => (!name || name.startsWith("/") || name.startsWith("http") ? name : `/images/spin/prizes/${name}.png`);
// The shard tier the wheel hands out. Wedge label, sprite and grant all read from this one place so they can
// never drift apart — bump it here if the wheel should ever pay better shards.
const FRAGMENT_PRIZE_TIER = "wooden";
const fragSprite = (tier) => `/images/sailing/fragment-${tier}.png`;
const fragName = (tier) => (CHEST_TIERS[tier]?.label || tier).replace(" Chest", "");
// FORGE PARTS wedge. One slot on each wheel, but the payout is rolled — usually a fistful of Iron Filings,
// occasionally a single Emberheart Shard. A fixed "3x Tempered Steel" wedge would be a known quantity you stop
// reading after the first week; a wedge that can pay the top tier is worth watching land every time.
const PART_ROLLS = [
    { tier: 2, n: 4, weight: 34 },   // Iron Filings
    { tier: 3, n: 3, weight: 38 },   // Tempered Steel
    { tier: 4, n: 2, weight: 20 },   // Mythril Dust
    { tier: 5, n: 1, weight: 8 },    // Emberheart Shard - the one you tell people about
];
const PARTS_WEDGE_SPRITE = partSprite(3); // the wedge face; the RESULT card shows whatever tier actually landed

// One-line explainer for a wheel prize — powers the "tap a reward to inspect it" card in the legend.
const SEED_RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// ── WHAT THE WEDGE ACTUALLY PAYS ─────────────────────────────────────────────────────────────────────────────
// Every gold wedge is minted on the way out (see the payout below: mint(..., "spin_prize")), and spin_prize is
// one of the named heavy faucets — so the effective rate is GOLD_MINT_RATE x 0.5, today 0.2. A wedge holding
// `amount: 250` pays FIFTY, and the label and the description both quoted the 250.
//
// Eric D: "the wheel prize descriptions still show the old gold amount for winnings instead of the newer
// lowered rates." Kaishiern, from the other end of the same fact: "the lowest you can win on the wheel is 50
// gold." Those are the same wedge — one of them read the label and the other read his balance.
//
// So the wheel quotes what it pays. Run through mint() rather than a copied 0.2, because a second copy of the
// rate is a second game: change GOLD_MINT_RATE and this follows it.
const goldShown = (n) => mint(Math.round(Number(n) || 0), "spin_prize");

// The face of the wedge, for the same reason as the description above it. A jackpot keeps its own name — it is
// a name rather than an amount — and everything that is not gold is untouched.
const goldLabel = (p) => (p.kind === "gold" && !p.mini && Number(p.amount) > 0
    ? `${goldShown(p.amount).toLocaleString()} gold`
    : p.label);

function prizeDesc(p) {
    switch (p.kind) {
        case "gold": return p.mini
            ? `The MINI JACKPOT — instantly bank ${goldShown(p.amount).toLocaleString()} gold.`
            : `Instantly bank ${goldShown(p.amount).toLocaleString()} gold.`;
        case "xp": return `Gain ${(p.amount || 0).toLocaleString()} XP toward your next level.`;
        case "consumable": return CONSUMABLES[p.consumable]?.desc || p.label;
        case "seed": return "A random farm seed to plant and grow in your pasture.";
        case "decoration": return "A random farm decoration you don't own yet — yours to place, and to keep placing.";
        case "fragment": return `${p.n || 1} ${fragName(p.tierId || FRAGMENT_PRIZE_TIER)} chest fragments — collect enough of a kind to forge that chest at the docks.`;
        case "chest": return `A ${cap(p.tierId)} loot chest — open it for gear, gold and more.`;
        case "recipe": return "A page for the Kitchen's book — something new you can cook.";
        case "gem": return "A cut gem — take it to the Jeweller and set it into a socket on gear you mean to keep.";
        case "doubloons": return "Sailing coin. Spend it with the Quartermaster on crates, ammo and evolve stones.";
        case "stone": return "A Lightstone or a Darkstone — makes a level-six pet's ability permanent, and changes the animal.";
        case "parts": return "A haul of Forge salvage \— Iron Filings through Emberheart Shard \— to spend enhancing your gear at the Forge.";
        // ── IT REPLACES YOUR PRIZE, IT IS NOT ADDED TO ONE ───────────────────────────────────────────────
        // Three members read this the same wrong way in one evening. SoullessShiitake: "it definitely seems
        // to imply you're getting 2 prizes." ValkyrieSylve quoted the line back verbatim and added "we all
        // play card games, text is everything." They are right and the copy was simply false: landing this
        // wedge pays nothing by itself — it sends you to a nine-wedge disc and you take ONE prize off it.
        //
        // Eric had it exactly: the point is not a second prize, it is a BETTER one. Nothing on the mini disc
        // is worse than 700 gold and the top of it is a Gold Chest, so the copy should sell the floor.
        case "mini_wheel": return "Re-spin on the Mini Wheel — one prize, from a far richer list.";
        case "respin": return "A free bonus spin — spin again on the house.";
        case "bonus_game": return "Play a pick-a-box match-3 round to win wheel-exclusive gear.";
        case "major_jackpot": return "The progressive community jackpot — win the entire pot.";
        default: return p.label;
    }
}

// Progressive jackpot tuning (shared community pot).
// HALVED with the rest of the faucets, but nerfed at the CONTRIBUTION rather than the payout: the wheel
// shows the running pot on screen, so halving what it pays out would make that number a lie. The spins
// that feed it are free, which is what makes the pot a mint rather than a player-funded pool.
const JACKPOT_BASE = 2500;      // pot reseeds to this when won
const JACKPOT_CONTRIB = 8;      // every spin adds this to the pot
const MINI_JACKPOT_AMT = 2200;  // the fixed MINI JACKPOT wedge — must stay above the 1,000 rare wedge

// TWENTY wedges — one prize each, shown on the wheel with real sprites. Regular prizes + four special wedges
// (MINI/MAJOR jackpot, MINI WHEEL bonus round, BONUS GAME gear pick).
const WHEELS = [
    {
        id: "wheel", name: "Prize Wheel", minLevel: 1,
        prizes: [
            // The floor wedge. It used to be "60 gold" at weight 31 - better than a fifth of every spin ever
            // taken landed on it, which is a lot of wheel to watch for the price of a couple of harvests. It
            // pays more now and comes up far less; the weight it gave up is spread across the middle of the
            // list, where the wedges people actually want to land on live.
            { label: "250 gold", sprite: "coins-small", weight: 12, kind: "gold", amount: 250 },
            // Was "200 XP" — the weakest thing on the wheel, and by some way: 200 XP is a rounding error to
            // anyone past the first week, so the most likely low-tier outcome was also the most forgettable.
            // The wheel is locked to EXACTLY 20 wedges (see WHEEL_WEDGES below — it throws at build time
            // otherwise), so making good on the eighteen decorations that claim `source: "spin"` meant taking
            // a wedge from something. This was the one to take. 500 XP is still on the wheel further down.
            { label: "Farm Decoration", sprite: "farm-deco", weight: 10, kind: "decoration" },
            { label: "Hearty Snack", sprite: "pet-treat", weight: 9, kind: "consumable", consumable: "treat_snack", n: 1 },
            // ── THE SEED WEDGE, PAYING SEEDS ─────────────────────────────────────────────────────────────
            // This slot handed over a Seed Packet: a consumable you then open, which rolls its own bundle
            // weighted to commons. Two layers of indirection to arrive at the thing the farm already trickles.
            // It pays SEEDS now, drawn from the wheel's band — mid-tier weighted, because commons are not
            // what anybody is short of.
            //
            // It replaces the packet rather than sitting beside it: the disc art has twenty wedges and the
            // build refuses a list that does not match it (a guard worth knowing about — it caught a 21st).
            { label: "Farm Seeds", sprite: "seed-pouch", weight: 8, kind: "seed", band: "spin", n: 3 },
            { label: "600 gold", sprite: "coins-big", weight: 12, kind: "gold", amount: 600 },
            { label: "5 Fertilizer", sprite: "fertilizer", weight: 7, kind: "consumable", consumable: "farm_fertilizer_crate", n: 1 },
            // ── A CUT GEM, WHERE THE WOODEN SHARDS USED TO BE ────────────────────────────────────────
            // Four wooden fragments is a quarter of the cheapest chest in the game — a wedge you were glad to
            // stop watching. The Jeweller shipped three days before this and NINE members in the whole Den
            // hold a single gem, because gems drop from the mine and the arena only: the two hardest-gated
            // systems there are. A low tier off the wheel is how somebody meets a socket for the first time.
            { label: "Cut Gem", sprite: "/images/gems/emerald_t2.png", weight: 8, kind: "gem" },
            { label: "MINI WHEEL", sprite: "mini-wheel", weight: 6, tier: "bonus", kind: "mini_wheel" },
            // The Forge and the Depths were the two newest systems in the game and the wheel had never heard of
            // either. Salvage parts are the thing every enhancer is short of, so this is the wedge that makes a
            // spin matter to someone who already has plenty of gold.
            { label: "Forge Parts", sprite: PARTS_WEDGE_SPRITE, weight: 7, kind: "parts" },
            { label: "500 XP", sprite: "xp-orb", weight: 7, kind: "xp", amount: 500 },
            { label: "Adrenaline Vial", sprite: "potion-red", weight: 6, kind: "consumable", consumable: "pot_adrenaline", n: 1 },
            // ── AND THE FREE SPIN IS GONE ────────────────────────────────────────────────────────────
            // "The free spin is pointless" — it is, and it is worse than pointless: it is the one wedge that
            // resolves to "you have not won anything yet, try again", on the wheel where every other wedge
            // ends the moment. Doubloons take the slot because sailing is the one big system the wheel had
            // never heard of (the same argument that put Forge Parts on here), and because doubloons are what
            // buys an evolve stone at the Quartermaster — so the wheel now points AT the chase rather than
            // handing it over.
            { label: "Doubloons", sprite: "/images/sailing/doubloon.png", weight: 8, kind: "doubloons", min: 40, max: 90 },
            { label: "Wooden Chest", sprite: "chest-wood", weight: 9, rare: true, tier: "rare", kind: "chest", tierId: "wooden" },
            // A WEDGE, not a hidden roll. The wheel used to grant recipes at a flat 2.5% AFTER it had already
            // landed on something else - 401 spins a week made it one of the top three sources in the game, and
            // none of it was on the wheel you were watching. Now you can see it and land on it.
            { label: "New Recipe", sprite: "recipe-scroll", weight: 3, rare: true, tier: "rare", kind: "recipe" },
            { label: "BONUS GAME", sprite: "mystery-box", weight: 5, tier: "bonus", kind: "bonus_game" },
            // ── THE GOLD LADDER, IN ORDER ────────────────────────────────────────────────────────────
            // This wedge paid 1,600 and the MINI JACKPOT below paid 1,500 — so the thing announced as a
            // jackpot was WORSE than an ordinary rare wedge, and rarer (weight 3 against 6). Landing the
            // jackpot was a downgrade you were supposed to cheer for. The rungs now climb: 250, 600, 1,000,
            // and the MINI JACKPOT genuinely on top at 2,200. Net effect on what the wheel mints is slightly
            // NEGATIVE, which is the direction it needed to go anyway.
            { label: "1,000 gold", sprite: "coins-big", weight: 6, rare: true, tier: "rare", kind: "gold", amount: 1000 },
            { label: "Berserker's Brew", sprite: "potion-brew", weight: 3, rare: true, tier: "rare", kind: "consumable", consumable: "pot_berserker", n: 1 },
            { label: "Gold Chest", sprite: "chest-gold", weight: 4, rare: true, tier: "rare", kind: "chest", tierId: "gold" },
            { label: "MINI JACKPOT", sprite: "coin-burst", weight: 3, rare: true, mini: true, tier: "mini", kind: "gold", amount: MINI_JACKPOT_AMT },
            { label: "MAJOR JACKPOT", sprite: "gem-jackpot", weight: 1, rare: true, jackpot: true, tier: "jackpot", kind: "major_jackpot" },
        ],
    },
];

// ── THE WEDGE COUNT IS LOAD-BEARING, SO IT IS ENFORCED ───────────────────────────────────────────────────
// wheel-disc.png is painted with exactly 20 physical wedges (dividers measured at 9° + k·18°), and the client
// lays icons out at index × 18°. A 21st prize therefore does not get a wedge — it lands at 20 × 18° = 360°,
// which is 0°, drawing straight on top of prize 0 at dead top. That is precisely what shipped: MAJOR JACKPOT
// was stacked over "50 gold" at the pointer, so a 50-gold win showed a jackpot gem under the wolf's nose, and
// the client's own `Math.min(WEDGES - 1, prizeIndex)` clamp meant actually winning the jackpot would have
// pointed at MINI JACKPOT instead. Both were invisible for as long as nobody counted the array.
//
// A throw here fails the build rather than the player. If a 21st prize is genuinely wanted, the disc art has
// to be repainted first — this constant is the contract between the array and the picture.
// ── THE GOLDEN WHEEL ────────────────────────────────────────────────────────────
// Bought once, for 20,000 chips, at the Counter. It REPLACES the ordinary wheel for the member who owns it —
// it is not a second daily spin, and there is no way to choose between them, because a wheel you have to pick
// is a decision nobody wants to make every morning.
//
// WHAT MAKES IT BETTER, and deliberately not "the same wheel with bigger numbers":
//   - the floor is gone. The ordinary wheel's likeliest outcome is 250 gold; this one's is 600, and every
//     wedge on it is something a maxed member would still be pleased to land on.
//   - the CHESTS move up a tier each (wooden -> iron, gold stays, and a Mythic wedge appears).
//   - the gems are cut deeper (t3-t4 against t1-t2).
//   - two more RARE wedges than the ordinary wheel, so the tail is fatter rather than just taller.
//
// The gold wedges are roughly double the ordinary wheel's, which is the one place this deliberately runs
// against the mint rate in gold-rate.js. That is the point of the purchase: it is paid for in chips, chips
// are only minted by staking gold on a floor that nets NEGATIVE, and it costs 20,000 of them. Anyone who has
// bought it has already fed the economy far more than this wheel gives back.
//
// PERK-GATED, not level-gated. `perk` on the wheel is what keeps it out of wheelForLevel and out of the
// "next wheel at level N" teaser — see the notes on both.
const GOLD_WHEEL = {
    id: "wheel_gold", name: "The Golden Wheel", minLevel: 1, perk: "wheel_gold",
    // NO SEPARATE DISC PAINTING. WHEEL_WEDGES is the contract between this array and the picture, and a
    // second disc would be a second thing that has to stay exactly 20 wedges forever. The client tints the
    // one disc instead — same geometry, gold light. See .cw-ring.is-gold.
    prizes: [
        { label: "600 gold", sprite: "coins-small", weight: 11, kind: "gold", amount: 600 },
        { label: "Farm Decoration", sprite: "farm-deco", weight: 7, kind: "decoration" },
        { label: "Adrenaline Vial", sprite: "potion-red", weight: 7, kind: "consumable", consumable: "pot_adrenaline", n: 2 },
        { label: "Farm Seeds", sprite: "seed-pouch", weight: 7, kind: "seed", band: "spin", n: 5 },
        { label: "1,200 gold", sprite: "coins-big", weight: 11, kind: "gold", amount: 1200 },
        { label: "5 Fertilizer", sprite: "fertilizer", weight: 6, kind: "consumable", consumable: "farm_fertilizer_crate", n: 1 },
        { label: "Deep Cut Gem", sprite: "/images/gems/emerald_t2.png", weight: 8, kind: "gem", minTier: 3, maxTier: 4 },
        { label: "MINI WHEEL", sprite: "mini-wheel", weight: 7, tier: "bonus", kind: "mini_wheel" },
        { label: "Forge Parts", sprite: PARTS_WEDGE_SPRITE, weight: 7, kind: "parts" },
        { label: "1,500 XP", sprite: "xp-orb", weight: 7, kind: "xp", amount: 1500 },
        { label: "Berserker's Brew", sprite: "potion-brew", weight: 6, kind: "consumable", consumable: "pot_berserker", n: 1 },
        { label: "Doubloons", sprite: "/images/sailing/doubloon.png", weight: 7, kind: "doubloons", min: 120, max: 260 },
        { label: "Iron Chest", sprite: "chest-iron", weight: 9, rare: true, tier: "rare", kind: "chest", tierId: "iron" },
        { label: "New Recipe", sprite: "recipe-scroll", weight: 4, rare: true, tier: "rare", kind: "recipe" },
        { label: "BONUS GAME", sprite: "mystery-box", weight: 6, tier: "bonus", kind: "bonus_game" },
        { label: "2,400 gold", sprite: "coins-big", weight: 6, rare: true, tier: "rare", kind: "gold", amount: 2400 },
        { label: "Gold Chest", sprite: "chest-gold", weight: 5, rare: true, tier: "rare", kind: "chest", tierId: "gold" },
        { label: "Mythic Chest", sprite: "chest-mythic", weight: 3, rare: true, tier: "rare", kind: "chest", tierId: "mythic" },
        { label: "MINI JACKPOT", sprite: "coin-burst", weight: 3, rare: true, mini: true, tier: "mini", kind: "gold", amount: MINI_JACKPOT_AMT * 2 },
        { label: "MAJOR JACKPOT", sprite: "gem-jackpot", weight: 2, rare: true, jackpot: true, tier: "jackpot", kind: "major_jackpot" },
    ],
};
WHEELS.push(GOLD_WHEEL);

export const WHEEL_WEDGES = 20;
for (const w of WHEELS) {
    if (w.prizes.length !== WHEEL_WEDGES) {
        throw new Error(`spin wheel "${w.id}" has ${w.prizes.length} prizes but the disc art has ${WHEEL_WEDGES} wedges — repaint wheel-disc.png or fix the list`);
    }
}

// ── THE MINI WHEEL BONUS ROUND ───────────────────────────────────────────────────────────────────────────
// NINE prizes, because mini-wheel.png is painted with exactly NINE wedges. It ran on eight for its whole life:
// the client laid icons out every 45 degrees over a disc divided every 40, so the icons drifted off their
// wedges, and the ninth prize - the rare one - was drawn at 8 x 45 = 360 = 0, directly on top of prize zero.
// Landing on it parked the pointer on the first prize's icon, so the best outcome in the bonus round was the
// one outcome that looked like the worst. Same failure the main wheel had with 21 prizes on 20 wedges, and it
// is guarded the same way below.
//
// This is a round you reach on ~4% of spins, so nothing on it is a consolation prize: the floor is 400 gold,
// the treat is the 150-pet-XP one rather than the 25, and the top wedge is a Gold Chest.
const MINI_WHEEL_PRIZES = [
    { label: "400 gold", sprite: "coins-big", weight: 17, kind: "gold", amount: 400 },
    // ── THE EVOLVE STONE, AND WHY IT IS HERE AND NOT ON THE BIG WHEEL ────────────────────────────────────
    // Luke asked for "an evolve stone with super rare chance on the wheel". It cannot go on the main wheel.
    // That wheel is spun 2.4 times a day by the average member and SIXTEEN times a day by the heaviest, so
    // even the smallest wedge possible there — weight 1 of 134 — hands a dedicated player about 1.3 stones a
    // month. Every existing source in the game combined pays 0.55, and pet-stones.js is explicit that
    // over-supply is the failure mode to avoid: a stone is only usable on a level-6 pet, and those take two
    // to three months each.
    //
    // The bonus round is the answer. You reach it on ~4% of spins, so a weight-2 wedge here is roughly one
    // spin in a thousand — a real chase, painted on a disc where you can see it, and it moves the monthly
    // rate by a fraction instead of breaking it. check-stones.mjs measures that ratio, and it is the reason
    // this number is 2 rather than a guess.
    { label: "EVOLVE STONE", sprite: "/images/pets/stone-light.png", weight: 1, rare: true, tier: "jackpot", kind: "stone" },
    // ── THE BONUS ROUND'S SEED WEDGE ─────────────────────────────────────────────────────────────────────
    // Luke: "the wheel should definitely have some higher tier seeds probably in the mini wheel." This is the
    // only wheel wedge that can turn up a Star Fruit — epic-weighted, with a real legendary tail, on a round
    // you reach about 4% of the time. The main wheel's seed wedge tops out at legendary and rarely.
    //
    // It takes the Chew Toy's slot rather than adding a tenth: mini-wheel.png is painted with nine wedges and
    // the build refuses a list that does not match the art. A pet treat is also the closest thing left on
    // this disc to the "something you would rather have skipped" the note below was written about.
    { label: "Choice Seeds", sprite: "seed-pouch", weight: 11, rare: true, tier: "rare", kind: "seed", band: "spin_mini", n: 3 },
    // ── THE BONUS ROUND EARNS ITS NAME ───────────────────────────────────────────────────────────────────
    // "The mini wheel should have cooler prizes." It carried eight wooden shards and a wooden chest — two of
    // the weakest things in the game — on a round you only reach on about 4% of spins. A round that rare
    // should never be able to pay you something you would rather have skipped.
    { label: "Cut Gem", sprite: "/images/gems/sapphire_t3.png", weight: 12, kind: "gem", minTier: 2, maxTier: 3 },
    { label: "700 gold", sprite: "coins-big", weight: 11, kind: "gold", amount: 700 },
    { label: "Iron Chest", sprite: "chest-wood", weight: 11, kind: "chest", tierId: "iron" },
    { label: "Forge Parts", sprite: PARTS_WEDGE_SPRITE, weight: 10, kind: "parts" },
    { label: "Second Wind", sprite: "potion-red", weight: 9, kind: "consumable", consumable: "pot_secondwind", n: 1 },
    { label: "Gold Chest", sprite: "chest-gold", weight: 6, rare: true, tier: "rare", kind: "chest", tierId: "gold" },
];

// mini-wheel.png has nine painted wedges (dividers measured every 40 degrees). Same contract, same hard stop.
export const MINI_WHEEL_WEDGES = 9;
if (MINI_WHEEL_PRIZES.length !== MINI_WHEEL_WEDGES) {
    throw new Error(`mini wheel has ${MINI_WHEEL_PRIZES.length} prizes but mini-wheel.png has ${MINI_WHEEL_WEDGES} wedges - repaint the disc or fix the list`);
}

// Wheel-exclusive gear the BONUS GAME awards (ids match items.js + mkt_item_sprite). All RARE; the match-3
// board draws BOARD_ITEMS of these at random, three tiles each.
const WHEEL_GEAR = ["wg_helm", "wg_shield", "wg_ring", "wg_cloak", "wg_amulet", "wg_blade", "wg_chest", "wg_belt", "wg_boots", "wg_axe"];
// ── WHAT A FINISHED SET IS PAID INSTEAD ──────────────────────────────────────────────────────────────────────
// Once all ten are yours the bonus round has nothing new to hand over, and it used to hand over nothing at all
// (see bonusFlip). Luke's call is a chest roll, and the tier is the wheel's OWN top chest rather than a number
// invented for this: the Gold Chest wedge above sits at weight 4 and the BONUS GAME wedge at weight 5, so
// finishing the collection turns the bonus wedge into a slightly-likelier version of the best chest the wheel
// already gives — an upgrade for having completed it, rather than a wedge that goes dead.
const BONUS_DUPE_CHEST = "gold";
const BOARD_ITEMS = 6; // distinct gear on the board (× 3 tiles each = 18 tiles → big, readable match-3)

// LEVEL ONLY. A perk wheel is never reachable from here — it is bought, not grown into — and skipping it in
// this loop is what stops it leaking into the six places that ask "which wheel does this member spin".
function wheelForLevel(level) {
    let w = WHEELS[0];
    for (const cand of WHEELS) if (!cand.perk && level >= cand.minLevel) w = cand;
    return w;
}

// ── WHICH WHEEL THIS MEMBER ACTUALLY SPINS ───────────────────────────────────────────────
// One extra primary-key read, on a path that already makes several. Every caller goes through this rather
// than reading the perk itself, so "does this member have the golden wheel" has exactly one spelling and a
// new caller cannot forget to ask.
async function wheelForMember(buyerId, level) {
    if (buyerId && await hasUnlock(buyerId, "wheel_gold").catch(() => false)) return GOLD_WHEEL;
    return wheelForLevel(level);
}

// Generic weighted pick → the chosen list ITEM (not index).
function pickWeighted(list, rand = Math.random) {
    const total = list.reduce((s, x) => s + (x.weight || 1), 0) || 1;
    let r = rand() * total;
    for (const x of list) { r -= x.weight || 1; if (r < 0) return x; }
    return list[list.length - 1];
}

// ── Shared progressive jackpot pot ──
export async function getJackpotPot() {
    const r = await db.queryOne(`SELECT pot FROM mkt_progressive_jackpot WHERE id = 1`).catch(() => null);
    return r?.pot != null ? Number(r.pot) : JACKPOT_BASE;
}
async function bumpJackpotPot(n) {
    await db.query(`INSERT INTO mkt_progressive_jackpot (id, pot) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET pot = mkt_progressive_jackpot.pot + $1, updated_at = NOW()`, [n]).catch(() => {});
}
// Atomically award the whole pot to the winner and reseed. Returns the amount won.
async function winJackpotPot(buyerId) {
    const r = await db
        .queryOne(
            `WITH cur AS (SELECT pot FROM mkt_progressive_jackpot WHERE id = 1 FOR UPDATE)
             UPDATE mkt_progressive_jackpot m SET pot = $2, last_winner = $1, last_won_at = NOW(), updated_at = NOW()
               FROM cur WHERE m.id = 1 RETURNING cur.pot AS won`,
            [buyerId, JACKPOT_BASE]
        )
        .catch(() => null);
    return r?.won != null ? Number(r.won) : JACKPOT_BASE;
}

// The MINI WHEEL bonus round: roll a prize on the small wheel, grant it, and return the wheel + winning index
// so the client can animate it.
async function rollMiniWheel(buyerId) {
    const idx = (() => { const pick = pickWeighted(MINI_WHEEL_PRIZES); return MINI_WHEEL_PRIZES.indexOf(pick); })();
    const prize = MINI_WHEEL_PRIZES[idx];
    const display = await grantPrize(buyerId, prize);
    return {
        prizes: MINI_WHEEL_PRIZES.map((p) => ({ label: p.label, sprite: P(p.sprite), tier: p.tier || (p.rare ? "rare" : "normal") })),
        index: idx,
        prize: { ...display, tier: prize.tier || (prize.rare ? "rare" : "normal") },
    };
}

const gearSprite = (id) => `/images/spin/gear/${id === "wg_ring" ? "wg-gauntlet" : id.replace("_", "-")}.png`;
// The board's ten Wheelwarden pieces are TROPHIES now, so they resolve out of collection-pieces.js rather than
// ITEMS. A trophy has no slot and no combat stats — it pays for being owned — so the card shows neither.
const gearCard = (id) => {
    const pc = pieceById(id);
    if (pc) return { id, name: pc.name, rarity: pc.rarity, sprite: gearSprite(id), slot: null, stats: "" };
    const it = itemById(id);
    return { id, name: it?.name || "Wheel Gear", rarity: it?.rarity || "rare", sprite: gearSprite(id), slot: it?.slot || null, stats: it?.stats ? describeStats(it.stats) : "" };
};
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The BONUS GAME is a MATCH-3: a board of face-down tiles, THREE of every gear on it (so the end reveal is
// honest — every piece really is there three times). The player flips tiles until they get three of a kind;
// the FIRST gear to reach three (by their own flip order) is what they win. The board is kept SERVER-SIDE so
// tiles stay hidden — the client flips one at a time via `bonusFlip`, and the win is granted there.
async function rollBonusGame(buyerId) {
    // Never board a piece they already hold: ownership is permanent and binary, so winning a duplicate is a
    // bonus round that pays nothing. Falls back to the full list once the set is complete, so the game still
    // runs rather than erroring on an empty board.
    const ownedSet = new Set(await getOwnedPieceIds(buyerId).catch(() => []));
    const fresh = WHEEL_GEAR.filter((id) => !ownedSet.has(id));
    // ── THE FALLBACK WAS FIRING AT HALF A SET, NOT AT A FULL ONE ─────────────────────────────────────────
    // Kaishiern: "What happens if you get a duplicate collectible? I got a second wolf fang blade from the
    // wheel."
    //
    // The line above filters out what you hold, and then the old version of this one threw that away the
    // moment `fresh` dropped below BOARD_ITEMS -- six. Ten pieces on the wheel, so from FIVE owned onwards
    // the board went back to the full list and could hand you a piece you already had. Not an edge case at
    // the end of a set: five of the thirty-four people with Wheelwarden pieces are at five or more right now,
    // Kaishiern among them at exactly five, and Eric D is at nine.
    //
    // And a duplicate pays NOTHING. grantPiece is ON CONFLICT DO NOTHING; ownership is binary and permanent,
    // so the bonus round declared a trophy, played the confetti and wrote no row.
    //
    // The board SHRINKS instead. Fewer kinds, still three tiles each, still an honest reveal -- a member two
    // pieces from a set gets a six-tile board and both of them are things they do not own.
    const chosen = shuffle([...(fresh.length ? fresh : WHEEL_GEAR)]).slice(0, BOARD_ITEMS);
    const tiles = shuffle(chosen.flatMap((id) => [id, id, id]));
    await db.query(`UPDATE mkt_buyer SET spin_bonus = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify({ board: tiles, flipped: [], done: false, need: 3 })]).catch(() => {});
    return { size: tiles.length, need: 3, roster: chosen.map(gearCard) };
}

// Flip one tile of the active match-3 board. Reveals its gear; when the player reaches three of a kind, grants
// that piece and returns the FULL board so the client can reveal everything.
export async function bonusFlip(buyerId, index) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT spin_bonus FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const g = row?.spin_bonus;
    if (!g || !Array.isArray(g.board)) return { ok: false, error: "no_game" };
    if (g.done) return { ok: false, error: "done" };
    const i = Number(index);
    if (!(i >= 0 && i < g.board.length) || g.flipped.includes(i)) return { ok: false, error: "bad_flip" };
    g.flipped.push(i);
    const revealedId = g.board[i];
    const count = g.flipped.filter((fi) => g.board[fi] === revealedId).length;
    let winner = null; let fullBoard = null;
    if (count >= (g.need || 3)) {
        g.done = true;
        // ── AND A FINISHED SET IS PAID A CHEST ───────────────────────────────────────────────────────
        // Only reachable with a COMPLETE set now (see rollBonusGame). grantPiece returns false when the row
        // already existed, and that return was being thrown away -- so the one case where the round paid
        // nothing was also the case that looked identical to winning. It pays BONUS_DUPE_CHEST now, and the
        // card says which of the two happened.
        const granted = await grantPiece(buyerId, revealedId, "wheel_bonus").catch(() => false);
        let chest = null;
        if (!granted) {
            await addChests(buyerId, { [BONUS_DUPE_CHEST]: 1 }, { source: "spin_bonus_dupe", meta: { piece: revealedId } }).catch(() => {});
            chest = { tier: BONUS_DUPE_CHEST, label: CHEST_TIERS[BONUS_DUPE_CHEST]?.label || "Chest" };
        }
        await trackActivity(buyerId, granted ? "spin_bonus_win" : "spin_bonus_dupe", { item: revealedId, chest: chest?.tier || null }).catch(() => {});
        winner = { ...gearCard(revealedId), duplicate: !granted, chest };
        fullBoard = g.board.map(gearCard);
    }
    await db.query(`UPDATE mkt_buyer SET spin_bonus = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify(g)]).catch(() => {});
    return { ok: true, index: i, tile: gearCard(revealedId), done: Boolean(winner), winner, board: fullBoard };
}

// Weighted pick of a prize INDEX, straight off the wheel's own weights — no pity, no floor, no thumb.
function pickIndex(wheel, rand = Math.random) {
    const pool = wheel.prizes.map((p, i) => ({ i, w: p.weight }));
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (total <= 0) return 0;
    let r = rand() * total;
    for (const x of pool) { r -= x.w; if (r < 0) return x.i; }
    return pool[pool.length - 1].i;
}

// Deliver a prize; returns display { sprite, text }. (MINI WHEEL / BONUS GAME are handled in doSpin.)
async function grantPrize(buyerId, prize, opts = {}) {
    const hh = await activeXpMultiplier().catch(() => 1);
    const goldMult = 1 + (opts.goldPct || 0) / 100; // Wheelwarden set: bonus gold on spin gold prizes.
    const sprite = prize.sprite ? P(prize.sprite) : null;
    if (prize.kind === "major_jackpot") {
        const won = await winJackpotPot(buyerId);
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, won]).catch(() => {});
        await logCoin(buyerId, won, "spin_prize", { meta: { prize: "MAJOR JACKPOT" } }).catch(() => {});
        await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug) VALUES ($1, 'jackpot') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
        return { sprite, text: `MAJOR JACKPOT — ${won.toLocaleString()} gold!`, amount: won };
    }
    if (prize.kind === "gold") {
        const amt = mint(Math.round(prize.amount * hh * goldMult), "spin_prize");
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, amt]).catch(() => {});
        await logCoin(buyerId, amt, "spin_prize", { meta: { prize: prize.label } }).catch(() => {});
        if (prize.mini) await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug) VALUES ($1, 'jackpot') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
        return { sprite, text: `${amt.toLocaleString()} gold${prize.mini ? " — MINI JACKPOT!" : ""}` };
    }
    // flat: true — the wedge SAYS a number, so the wedge PAYS that number. It rode every earn-rate buff, so an
    // 800-XP wedge paid 936 and a 2,000 paid 2,288 while the card still read the wedge. Same rule the XP scrolls
    // got on 2026-08-08 and for the same reason: a fixed prize is not effort, and a spin can be bought with
    // gold, so multiplying it is the same gold→XP arbitrage through a different door.
    //
    // gold: 0 — AND IT WAS PAYING BOTH. awardXp mints gold 1:1 with points unless a caller says otherwise, so
    // an "XP" wedge quietly handed over the same number in gold as well: the 2,000 XP prize was 2,000 XP AND
    // 2,000 gold, landing in the ledger as `xp_accrual` where nobody would think to look for wheel prizes.
    // This wheel already HAS gold wedges — that is what they are for — so the XP wedge paying gold made the
    // two prize types the same prize, and made the XP one strictly better. It pays XP. That is the wedge.
    if (prize.kind === "xp") { await awardXp(buyerId, "spin_reward", { points: prize.amount, gold: 0, flat: true }).catch(() => {}); return { sprite, text: `${prize.amount.toLocaleString()} XP` }; }
    if (prize.kind === "consumable") { await grantConsumable(buyerId, prize.consumable, prize.n || 1).catch(() => {}); return { sprite, text: prize.label }; }
    if (prize.kind === "fragment") {
        // WAS a chest shard. Chests come only from digging now, so the wedge pays doubloons — priced off the
        // tier it used to hand out, so the good wedge is still the good wedge.
        const tier = prize.tierId || FRAGMENT_PRIZE_TIER;
        const n = (prize.n || 1) * (SPIN_DOUBLOONS_BY_TIER[tier] || SPIN_DOUBLOONS_BY_TIER.wooden);
        try { const { grantDoubloons } = await import("@/lib/marketplace/sailing.js"); await grantDoubloons(buyerId, n); } catch { /* best-effort */ }
        return { sprite: "/images/sailing/doubloon.png", text: `${n} Doubloon${n === 1 ? "" : "s"}` };
    }
    if (prize.kind === "parts") {
        // Roll the tier, then show THAT tier's art on the result card — the wedge wears Tempered Steel, but a
        // card reading "Emberheart Shard" beside a picture of steel filings undersells the best outcome.
        const roll = pickWeighted(PART_ROLLS);
        await addParts(buyerId, roll.tier, roll.n).catch(() => {});
        return { sprite: partSprite(roll.tier) || sprite, text: `${roll.n}× ${partName(roll.tier)}` };
    }
    if (prize.kind === "respin") { await grantSpinTokens(buyerId, 1); return { sprite, text: "Spin again — on the house!" }; }
    // ── A CUT GEM ────────────────────────────────────────────────────────────────────────────────────────
    // One of the five kinds at a low tier, so it is a stat you chose to socket rather than a stat you were
    // handed. The Wolf's Eye is excluded on purpose: gems.js is explicit that the sixth kind only ever comes
    // out of the deep dark of the mine and that nothing should advertise it.
    if (prize.kind === "gem") {
        const { GEM_KINDS, gemId, gemById } = await import("@/lib/marketplace/gems.js");
        const { grantGem } = await import("@/lib/marketplace/jeweller.js");
        const kind = GEM_KINDS[Math.floor(Math.random() * GEM_KINDS.length)];
        const lo = prize.minTier || 1, hi = prize.maxTier || 2;
        const tier = lo + Math.floor(Math.random() * (hi - lo + 1));
        const id = gemId(kind.id, tier);
        await grantGem(buyerId, id, 1, "spin").catch(() => {});
        const g = gemById(id);
        return { sprite: `/images/gems/${id}.png`, text: g ? `${g.name}!` : "A cut gem!" };
    }
    // ── DOUBLOONS ────────────────────────────────────────────────────────────────────────────────────────
    // Sailing's currency, and the wheel had never paid it. Sized against what the sea actually pays — a
    // maxed captain earns ~180 a day — so this is a few hours of voyaging, not a shortcut past the 4,000 a
    // stone costs at the Quartermaster.
    if (prize.kind === "doubloons") {
        const n = (prize.min || 40) + Math.floor(Math.random() * ((prize.max || 90) - (prize.min || 40) + 1));
        // Upserted rather than updated: a member who has never put to sea has no mkt_sailing row, and a bare
        // UPDATE against one would touch nothing and silently pay them nothing. Same shape sailing.js uses.
        await db.query(
            `INSERT INTO mkt_sailing (buyer_id, doubloons) VALUES ($1, $2)
             ON CONFLICT (buyer_id) DO UPDATE SET doubloons = COALESCE(mkt_sailing.doubloons,0) + $2, updated_at = NOW()`,
            [buyerId, n]
        ).catch(() => {});
        return { sprite, text: `${n} doubloons` };
    }
    // ── AN EVOLVE STONE ──────────────────────────────────────────────────────────────────────────────────
    // The bonus round's crown. Which of the two you get is a coin flip, because the choice between them is
    // meant to be made against a PET (see pet-stones.js — the effects are authored per animal), and handing
    // somebody the one they wanted would make that choice for them.
    if (prize.kind === "stone") {
        const { STONE_IDS } = await import("@/lib/marketplace/pet-stones.js");
        const id = STONE_IDS[Math.floor(Math.random() * STONE_IDS.length)];
        const { grantStone } = await import("@/lib/marketplace/pet-ascension.js");
        await grantStone(buyerId, id, 1, "spin_wheel").catch(() => {});
        return { sprite: `/images/pets/stone-${id}.png`, text: `${id === "light" ? "A Lightstone" : "A Darkstone"} — evolve a level-six pet!` };
    }
    if (prize.kind === "chest") { await addChests(buyerId, { [prize.tierId]: 1 }, { source: "daily_spin" }).catch(() => {}); return { sprite, text: prize.label }; }
    if (prize.kind === "recipe") {
        const { grantRecipeReward } = await import("@/lib/marketplace/cooking.js");
        const rec = await grantRecipeReward(buyerId, "spin").catch(() => null);
        // Knows every recipe the wheel can teach? Pay gold rather than landing on a blank wedge.
        if (!rec) { await db.query(`UPDATE mkt_buyer SET gold = gold + 300 WHERE id = $1`, [buyerId]).catch(() => {}); return { sprite, text: "300 gold — you already know them all" }; }
        // Same fault, same fix: the recipe wedge showed its own icon for every page in the book. A
        // recipe's art is the dish it makes (mkt_cooking_sprite, keyed by the recipe's `out`).
        // Keyed by the RECIPE id (k_flour), not the thing it outputs — every one of the 78 has art.
        const dish = await db.queryOne(`SELECT url FROM mkt_cooking_sprite WHERE ref = $1`, [rec.id]).catch(() => null);
        return { sprite: dish?.url || sprite, text: `${rec.name} — a new recipe!` };
    }
    if (prize.kind === "seed") {
        // ── A REAL SEED WEDGE, AT THE BAND THE WEDGE DECLARES ────────────────────────────────────────────
        // This handler existed and could only ever pay a COMMON — the one thing nobody needs, since commons
        // are what the farm already trickles. And no wedge on either wheel was `kind: "seed"` in the first
        // place, so it had never run: the wheel's only seed was a Seed Packet consumable, and the seed table
        // listed `spin` with tuned odds that nothing ever called.
        //
        // The wedge names its band, so the mini wheel can reach where the main wheel cannot.
        const { grantSeedFromBand } = await import("@/lib/marketplace/farm-crops.js");
        const n = Math.max(1, Number(prize.n) || 1);
        const got = [];
        for (let i = 0; i < n; i += 1) {
            const seed = await grantSeedFromBand(buyerId, prize.band || "spin").catch(() => null);
            if (seed) got.push(seed);
        }
        if (!got.length) return { sprite, text: prize.label };
        const best = got.reduce((a, b) => (SEED_RARITY_ORDER.indexOf(b.rarity) > SEED_RARITY_ORDER.indexOf(a.rarity) ? b : a));
        return { sprite, text: got.length > 1 ? `${got.length} seeds — best: ${best.name}!` : `${best.name} seed!` };
    }
    // A FARM DECORATION. Eighteen decorations in decorations.js are declared `source: "spin"`, and the farm
    // tells you so to your face — "🎡 Win it from the Daily Spin wheel" — but no wedge had ever been able to
    // pay one out and grantDecoration() was only ever reached from the shop and the Town glint. Those eighteen
    // were unobtainable for their whole life while the UI kept pointing at this wheel.
    if (prize.kind === "decoration") {
        const { DECORATIONS } = await import("@/lib/marketplace/decorations.js");
        const { grantDecoration } = await import("@/lib/marketplace/farm-decorations.js");
        const pool = DECORATIONS.filter((d) => d.source === "spin");
        const owned = new Set((await db.query(`SELECT deco_id FROM mkt_deco_owned WHERE buyer_id = $1`, [buyerId]).catch(() => []) || []).map((r) => r.deco_id));
        const fresh = pool.filter((d) => !owned.has(d.id));
        // Own every one of them? Pay gold rather than landing on a blank wedge — same as the recipe wedge above.
        if (!fresh.length) {
            await db.query(`UPDATE mkt_buyer SET gold = gold + 400 WHERE id = $1`, [buyerId]).catch(() => {});
            return { sprite, text: "400 gold — your farm has them all" };
        }
        const pick = fresh[Math.floor(Math.random() * fresh.length)];
        await grantDecoration(buyerId, pick.id, 1, "spin").catch(() => {});
        // ── THE PIECE YOU WON, NOT THE WEDGE IT CAME OFF ────────────────────────────────────────
        // `sprite` is the WEDGE's art — one generic planter for all eighteen decorations — so winning
        // Bunting Flags showed you a birdhouse. The real art is already drawn and stored; this is the
        // one moment the player is looking straight at the thing they just got.
        const { getDecoSprites } = await import("@/lib/marketplace/farm-decorations.js");
        const art = (await getDecoSprites([pick.id]).catch(() => ({})))[pick.id] || sprite;
        return { sprite: art, text: `${pick.name} — for the farm!` };
    }
    return { sprite, text: prize.label };
}

// Give spin tokens (from quests / boss kills / streaks). Exported for the tie-ins.
export async function grantSpinTokens(buyerId, n = 1) {
    if (!buyerId || n <= 0) return;
    await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $2 WHERE id = $1`, [buyerId, Math.floor(n)]).catch(() => {});
}

// Store-day helper. free_spin_day is a SQL DATE — always SELECT it as ::text and compare strings; building
// a JS Date from it reformats in the process TZ and rolls the day back on Vercel (UTC), which would make
// the free daily spin look available again on every refresh. (Same fix as daily-checkin.)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const asDay = (v) => (v ? String(v).slice(0, 10) : null);

// ── THE WHEEL, DRESSED FOR A SCREEN ──────────────────────────────────────────────────────────────────────────
// One mapping from a wheel definition to what a client is allowed to know about it: the wedge faces in disc
// order, and the odds of each. `odds` rather than `weight` because a weight only means anything next to the
// total — and because the counter screen rolls its demo spin off this same array, so the wheel a stranger
// watches in the shop behaves like the wheel they get when they sign up, without shipping the raw table.
export function wheelView(wheel) {
    const total = wheel.prizes.reduce((s, p) => s + p.weight, 0) || 1;
    return {
        id: wheel.id,
        name: wheel.name,
        disc: wheel.disc || null,
        prizes: wheel.prizes.map((p) => ({
            label: goldLabel(p),
            sprite: p.sprite ? P(p.sprite) : null,
            rare: Boolean(p.rare),
            tier: p.tier || (p.rare ? "rare" : "normal"),
            odds: Math.round((p.weight / total) * 1000) / 10,
            desc: prizeDesc(p),
        })),
    };
}

/**
 * The ordinary wheel, for a screen with nobody signed in behind it (the counter display).
 *
 * WHEELS[0] on purpose, never wheelForMember: the Golden Wheel is a 20,000-chip perk, and a shop screen
 * advertising its numbers to the street would be showing prizes that no new account can reach.
 */
export function publicWheelView() {
    return wheelView(WHEELS[0]);
}

export async function getSpinState(buyerId) {
    if (!buyerId) return { signedIn: false };
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, COALESCE(spin_tokens,0) AS tokens, free_spin_day::text AS free_spin_day, COALESCE(spin_count,0) AS spin_count, spin_buys_day::text AS spin_buys_day, COALESCE(spin_buys_count,0) AS spin_buys_count, spin_bonus FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(row?.xp || 0).level;
    // Resume an unfinished match-3 bonus board across a refresh so an abandoned game isn't lost.
    const bonusResume = (() => {
        const g = row?.spin_bonus;
        if (!g || !Array.isArray(g.board) || g.done) return null;
        const revealed = {};
        for (const i of (g.flipped || [])) revealed[i] = gearCard(g.board[i]);
        return { size: g.board.length, need: g.need || 3, roster: [...new Set(g.board)].map(gearCard), revealed };
    })();
    const wheel = await wheelForMember(buyerId, level);
    const freeAvailable = asDay(row?.free_spin_day) !== today();
    // Extra-spin price escalates 1000, 2000, 3000… per store-day (resets at midnight Central).
    const boughtToday = asDay(row?.spin_buys_day) === today() ? (row?.spin_buys_count || 0) : 0;
    const tokenCost = nextSpinCost(boughtToday);
    // `!w.perk` — without it this teaser would announce "The Golden Wheel at level 1" to everybody who
    // does not own it, which is precisely the leak the unlock is supposed to prevent.
    const next = WHEELS.find((w) => !w.perk && w.minLevel > level);
    return {
        signedIn: true,
        gold: row?.gold || 0,
        tokens: row?.tokens || 0,
        spinCount: row?.spin_count || 0,
        bonusResume, // an unfinished match-3 board to re-open on load
        freeAvailable,
        tokenCost,
        extraSpinsToday: boughtToday,
        isOwner: isOwner(buyerId), // owner-only free-reset button (debugging)
        // The Wheelwarden chase — ten wheel-exclusive pieces, shown on the wheel that drops them.
        collections: await (async () => {
            const [{ collectionsForFeature }, { getOwnedPieceIds: ownedPieces }] = await Promise.all([
                import("@/lib/marketplace/sets.js"),
                import("@/lib/marketplace/collection-owned.js"),
            ]);
            // Collections count TROPHIES, which live in mkt_user_collection — reading the item bag here would
        // report every set as 0 collected.
        return collectionsForFeature("wheel", await ownedPieces(buyerId).catch(() => []));
        })().catch(() => []),
        jackpotPot: await getJackpotPot(), // shared progressive MAJOR JACKPOT
        wheel: wheelView(wheel),
        nextWheel: next ? { name: next.name, atLevel: next.minLevel } : null,
        canSpin: freeAvailable || (row?.tokens || 0) > 0,
    };
}

// Do a spin (uses the free daily spin first, else a token). Returns the winning segment index + prize.
// The open decision, dressed for the wheel. Reads off the wheel the spin was TAKEN on rather than the one the
// member is on now — a level-up between the spin and the choice must not change what was offered.
async function pendingChoiceView(buyerId, fallbackWheel) {
    const pend = await pendingOf(buyerId);
    if (!pend) return null;
    const wheel = (await wheelForMember(buyerId, pend.level)) || fallbackWheel;
    return {
        rerolled: pend.offered.length > 1,
        offered: pend.offered.map((i) => ({ index: i, label: wheel.prizes[i].label, ...previewPrize(wheel.prizes[i]) })),
    };
}

export async function doSpin(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(spin_tokens,0) AS tokens, free_spin_day::text AS free_spin_day FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "not_signed_in" };
    // A choice left open is settled before another spin is allowed — in the member's favour, since they never
    // said no to either wedge. Without this, walking away mid-decision would quietly bin the prize.
    const stranded = await pendingOf(buyerId);
    if (stranded) await spinKeep(buyerId, stranded.offered[stranded.offered.length - 1]).catch(() => {});
    const freeAvailable = asDay(row.free_spin_day) !== today();
    let grantedFree = false;
    // ── THE FREE SPIN ────────────────────────────────────────────────────────────────────────────────────
    // Three free a day rather than one. free_spin_day is a single dated flag, so it cannot count to three on
    // its own — the extra two are read off how many spins have already been taken today, which spin_count
    // already tracks. A member with the power is free until they have spun three times.
    const spinPowers = await equippedPowers(buyerId);
    if (!freeAvailable && spinPowers.has("free_spin")) {
        const today3 = await db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_coin_event
              WHERE buyer_id = $1 AND kind = 'spin'
                AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date`,
            [buyerId]
        ).catch(() => null);
        if ((Number(today3?.n) || 0) < 3) grantedFree = true;
    }
    // Consume a spin atomically (free first, else a token).
    let consumed = null;
    if (freeAvailable) {
        consumed = await db.queryOne(`UPDATE mkt_buyer SET free_spin_day = $2::date WHERE id = $1 AND (free_spin_day IS DISTINCT FROM $2::date) RETURNING id`, [buyerId, today()]).catch(() => null);
    }
    // The dated flag can only ever be spent ONCE a day, so The Free Spin's second and third cannot go through
    // it — they consume nothing at all. Kept separate from `freeAvailable` for exactly that reason: conflating
    // them made the second free spin fail the guarded UPDATE and fall through to charging a token.
    if (!consumed && grantedFree) consumed = { id: buyerId };
    if (!consumed) {
        consumed = await db.queryOne(`UPDATE mkt_buyer SET spin_tokens = spin_tokens - 1 WHERE id = $1 AND spin_tokens > 0 RETURNING id`, [buyerId]).catch(() => null);
        if (!consumed) return { ok: false, error: "no_spins" };
    }
    // Every spin feeds the shared progressive jackpot.
    await bumpJackpotPot(JACKPOT_CONTRIB).catch(() => {});
    // Wheelwarden's Fortune: bonus spin gold on a Lucky proc, and a free-respin capstone. A COLLECTION set —
    // ten wheel-exclusive pieces, two of which share a slot, so it could never all be worn at once anyway.
    // Winning the piece is what counts now, which is the only reading of a collect-them-all chase that makes
    // sense: you cannot ask someone to wear a wheel prize to spin the wheel.
    const owned = await getOwnedSetIds(buyerId).catch(() => []);
    const luckChance = setWheelBonus(owned).luck || 0;  // % CHANCE for a Lucky Spin proc this spin
    const respinChance = setWheelRespinChance(owned);   // capstone: 0..0.5
    const lucky = luckChance > 0 && Math.random() * 100 < luckChance; // did the wheel set proc this spin?
    const level = levelForXp(row.xp).level;
    const wheel = await wheelForMember(buyerId, level);
    const idx = pickIndex(wheel);
    const prize = wheel.prizes[idx];
    // Special wedges roll a sub-game; everything else is a direct grant.
    let display;
    let miniWheel = null;
    let bonusGame = null;
    // ── DEALER'S CHOICE ──────────────────────────────────────────────────────────────────────────────────
    // The claim is made HERE, after the wedge is known, and never for a sub-game wedge: the Mini Wheel and the
    // Bonus Game resolve into a second interaction that has already paid out by the time anyone could choose,
    // so offering a re-roll on one would either strand the sub-game or pay it twice. Spending the day's single
    // use on a wedge it cannot apply to would be the worst of both.
    const subGame = prize.kind === "mini_wheel" || prize.kind === "bonus_game";
    const dealer = !subGame && (await claimPowerUse(buyerId, "dealer_s_choice"));
    if (prize.kind === "mini_wheel") { miniWheel = await rollMiniWheel(buyerId); display = { sprite: P(prize.sprite), text: "Mini Wheel — a richer spin!" }; }
    else if (prize.kind === "bonus_game") { bonusGame = await rollBonusGame(buyerId); display = { sprite: P(prize.sprite), text: "Bonus Game — pick your gear!" }; }
    // Held, not paid. The member has not chosen yet, and a prize that has been handed over cannot be swapped
    // for the other one without clawing it back.
    else if (dealer) {
        display = previewPrize(prize);
        await db.query(`UPDATE mkt_buyer SET spin_pending = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify({ level, lucky, offered: [idx] })]).catch(() => {});
    }
    else display = await grantPrize(buyerId, prize, { goldPct: lucky ? LUCKY_GOLD_PCT : 0 });
    await db.query(`UPDATE mkt_buyer SET spin_count = spin_count + 1 WHERE id = $1`, [buyerId]).catch(() => {});
    // Capstone: a chance the spin is refunded (a free spin token back).
    let refunded = false;
    if (respinChance > 0 && Math.random() < respinChance) { await grantSpinTokens(buyerId, 1).catch(() => {}); refunded = true; }
    await bumpQuestProgress(buyerId, "spin", 1).catch(() => {});
    await trackActivity(buyerId, "daily_spin", { prize: prize.label }).catch(() => {});

    await syncEarnedBadges(buyerId).catch(() => {}); // spin-count badges
    const prizeOut = {
        ...display,
        label: prize.label,
        tier: prize.tier || (prize.rare ? "rare" : "normal"),
        jackpot: Boolean(prize.jackpot), mini: Boolean(prize.mini), rare: Boolean(prize.rare),
        respin: Boolean(prize.kind === "respin"),
        miniWheel: Boolean(prize.kind === "mini_wheel"), bonusGame: Boolean(prize.kind === "bonus_game"),
    };
    return { ok: true, prizeIndex: idx, prize: prizeOut, miniWheel, bonusGame, refunded, lucky, dealer, ...(await getSpinState(buyerId)) };
}

// ── DEALER'S CHOICE: THE SECOND WEDGE, AND THE DECISION ──────────────────────────────────────────────────────
// A spin taken with the power in hand pays nothing until one of these two is called. Between them the prize
// lives on mkt_buyer.spin_pending — see the migration for why it cannot simply be granted and swapped later.

/** What a wedge looks like without handing it over. Pure — the display half of grantPrize, and nothing else. */
const previewPrize = (prize) => ({ sprite: prize.sprite ? P(prize.sprite) : null, text: prize.label });

const pendingOf = async (buyerId) => {
    const r = await db.queryOne(`SELECT spin_pending FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const p = r?.spin_pending;
    return p && Array.isArray(p.offered) && p.offered.length ? p : null;
};

/** Roll the second wedge. Grants nothing — it puts both on the table so the member can pick. */
export async function spinReroll(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const pend = await pendingOf(buyerId);
    if (!pend) return { ok: false, error: "nothing_pending" };
    if (pend.offered.length > 1) return { ok: false, error: "already_rerolled" };
    const wheel = await wheelForMember(buyerId, pend.level);
    // A re-roll that lands on a sub-game wedge would resolve into a second interaction the member has not
    // chosen yet, so it is drawn again off the non-sub-game wedges. Bounded rather than looped: a wheel is
    // twenty wedges and this cannot spin forever on an unlucky table.
    let idx = pickIndex(wheel);
    for (let i = 0; i < 12 && (wheel.prizes[idx].kind === "mini_wheel" || wheel.prizes[idx].kind === "bonus_game"); i += 1) idx = pickIndex(wheel);
    const offered = [...pend.offered, idx];
    await db.query(`UPDATE mkt_buyer SET spin_pending = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify({ ...pend, offered })]).catch(() => {});
    return {
        ok: true, prizeIndex: idx,
        offered: offered.map((i) => ({ index: i, label: wheel.prizes[i].label, ...previewPrize(wheel.prizes[i]) })),
        ...(await getSpinState(buyerId)),
    };
}

/** Take one of them. `index` must be one of the wedges actually offered — never a number off a client. */
export async function spinKeep(buyerId, index) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const pend = await pendingOf(buyerId);
    if (!pend) return { ok: false, error: "nothing_pending" };
    const idx = Number(index);
    if (!pend.offered.includes(idx)) return { ok: false, error: "not_offered" };
    const wheel = await wheelForMember(buyerId, pend.level);
    // Cleared FIRST, guarded on the pending value still being there, so two taps cannot both pay out.
    const cleared = await db.queryOne(
        `UPDATE mkt_buyer SET spin_pending = NULL WHERE id = $1 AND spin_pending IS NOT NULL RETURNING id`, [buyerId]
    ).catch(() => null);
    if (!cleared) return { ok: false, error: "nothing_pending" };
    const display = await grantPrize(buyerId, wheel.prizes[idx], { goldPct: pend.lucky ? LUCKY_GOLD_PCT : 0 });
    return { ok: true, prizeIndex: idx, prize: { ...display, label: wheel.prizes[idx].label }, ...(await getSpinState(buyerId)) };
}

// OWNER-ONLY debug helper: refill the free daily spin so you can spin freely while testing. Gives exactly ONE
// spin (just clears free_spin_day — no bonus token). No-op for anyone who isn't the owner.
export async function resetSpin(buyerId) {
    if (!buyerId || !isOwner(buyerId)) return { ok: false, error: "forbidden" };
    await db.query(`UPDATE mkt_buyer SET free_spin_day = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getSpinState(buyerId)) };
}

// OWNER-ONLY: trigger a sub-game directly for testing (the match-3 BONUS GAME or the MINI WHEEL) without
// waiting to land on its wedge. No-op for non-owners.
export async function ownerSpinTrigger(buyerId, what) {
    if (!buyerId || !isOwner(buyerId)) return { ok: false, error: "forbidden" };
    if (what === "bonus") { const bonusGame = await rollBonusGame(buyerId); return { ok: true, bonusGame, ...(await getSpinState(buyerId)) }; }
    if (what === "mini") { const miniWheel = await rollMiniWheel(buyerId); return { ok: true, miniWheel, ...(await getSpinState(buyerId)) }; }
    return { ok: false, error: "bad_trigger" };
}

// The gold cost of the NEXT extra spin today: 1000 for the first, +1000 each additional, reset at the
// store-local midnight. `boughtToday` = extra spins already bought this store-day.
const SPIN_BUY_STEP = 1000;
const nextSpinCost = (boughtToday) => (Math.max(0, boughtToday) + 1) * SPIN_BUY_STEP;

// Buy one extra spin token with gold. Cost escalates per day (atomic — one UPDATE computes cost + counter).
export async function buySpinToken(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const preSpinState = await getSpinState(buyerId).catch(() => null);
    const spinCost = preSpinState?.tokenCost ?? null;
    const paid = await db
        .queryOne(
            `UPDATE mkt_buyer SET
                gold = gold - (CASE WHEN spin_buys_day = $2::date THEN spin_buys_count + 1 ELSE 1 END) * ${SPIN_BUY_STEP},
                spin_tokens = spin_tokens + 1,
                spin_buys_count = CASE WHEN spin_buys_day = $2::date THEN spin_buys_count + 1 ELSE 1 END,
                spin_buys_day = $2::date
              WHERE id = $1
                AND gold >= (CASE WHEN spin_buys_day = $2::date THEN spin_buys_count + 1 ELSE 1 END) * ${SPIN_BUY_STEP}
              RETURNING gold`,
            [buyerId, today()]
        )
        .catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    if (spinCost) await logCoin(buyerId, -spinCost, "buy_spin", { balanceAfter: paid.gold }).catch(() => {});
    await trackActivity(buyerId, "buy_spin", spinCost ? { cost: spinCost } : {}).catch(() => {});
    return { ok: true, ...(await getSpinState(buyerId)) };
}
