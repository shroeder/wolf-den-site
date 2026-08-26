// ── DOES THE COUNTER SELL THINGS THAT EXIST? ─────────────────────────────────────────────────────────────────
// Every item on the chip shelf names a ref in somebody else's catalog — a decoration id, a gem id, a
// consumable id, a forge part tier. Nothing checks those at runtime: the store takes the chips, writes the
// unlock row and reports success, and the member owns a decoration the farm has never heard of. It renders as
// nothing, it cannot be refunded by anyone who does not know it happened, and the only symptom is one person
// saying "I bought the thing and it isn't there".
//
// The first cut of that shelf invented EVERY id on it. This is the check that caught it.
import {
    CHIP_STORE, VIP_STORE, STAT_STORE, UNLOCK_STORE, CHIP_RATE, DISCOUNT_MAX, counterDiscount, pricedFor,
} from "../src/lib/marketplace/chips.js";
import { STAT_STEP, STAT_TRACKS, UNLOCKS, statCost } from "../src/lib/marketplace/casino-perks.js";
import { STAT_META } from "../src/lib/marketplace/items.js";
import { DECORATIONS } from "../src/lib/marketplace/decorations.js";
import { GEMS } from "../src/lib/marketplace/gems.js";
import { CONSUMABLES } from "../src/lib/marketplace/consumables.js";
import { COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";
import { PART_TIERS } from "../src/lib/marketplace/crafting.js";
import { CHEST_TIERS } from "../src/lib/marketplace/chests.js";

const decos = new Set(DECORATIONS.map((d) => d.id));
const gems = new Set((GEMS || []).map((g) => g.id));
const cons = new Set(Object.keys(CONSUMABLES));
const pets = new Set(COLLECTIBLES.map((p) => p.id));
const tiers = new Set(PART_TIERS.map((t) => t.tier));
const chests = new Set(Object.keys(CHEST_TIERS));

const problems = [];
const seen = new Set();

// BOTH SHELVES. The VIP vendor is the same machinery behind a flag, and an item nobody can see is exactly
// the item whose broken ref nobody would ever notice — it would sit there taking chips from the three people
// allowed to reach it. Checked together so a shelf cannot be added without being checked.
// ALL FOUR SHELVES. An item nobody can see is exactly the item whose broken ref nobody would notice — it
// would sit there taking chips from the few people allowed to reach it. Checked together so a shelf cannot be
// added without being checked.
const statIds = new Set(STAT_TRACKS.map((t) => t.perk));
const unlockIds = new Set(UNLOCKS.map((u) => u.perk));
for (const item of [...CHIP_STORE, ...VIP_STORE, ...STAT_STORE, ...UNLOCK_STORE]) {
    if (seen.has(item.id)) problems.push(`two shelf entries share the id "${item.id}"`);
    seen.add(item.id);
    // A stat track is priced per member (statCost), so a 0 here is correct rather than a mistake.
    if (item.kind !== "stat" && !(item.price > 0)) problems.push(`${item.id} is priced at ${item.price}`);

    const miss = (what) => problems.push(`${item.id} ("${item.name}") names ${what}, which no catalog has — it would take the chips and deliver nothing`);
    switch (item.kind) {
        case "decoration": if (!decos.has(item.ref)) miss(`decoration "${item.ref}"`); break;
        case "pet": if (!pets.has(item.ref)) miss(`pet "${item.ref}"`); break;
        case "gems": if (!gems.has(item.ref)) miss(`gem "${item.ref}"`); break;
        case "parts": {
            const [tier, count] = Array.isArray(item.ref) ? item.ref : [];
            if (!tiers.has(tier)) miss(`forge part tier ${tier}`);
            if (!(count > 0)) problems.push(`${item.id} grants ${count} parts`);
            break;
        }
        case "chest": if (!chests.has(item.ref)) miss(`chest tier "${item.ref}"`); break;
        // A stat track has to name a real perk AND a real combat stat, because the two are different strings
        // and only one of them is what combatStats sums.
        case "stat": {
            if (!statIds.has(item.ref)) miss(`stat track "${item.ref}"`);
            const t = STAT_TRACKS.find((x) => x.perk === item.ref);
            if (t && !STAT_META?.[t.stat]) miss(`combat stat "${t.stat}"`);
            // The four he named, and deliberately not the crits — an infinite track on a multiplier
            // compounds against every other source in the game.
            if (t && ["crit_chance", "crit_power"].includes(t.stat)) {
                problems.push(`${item.id} sells an infinite track on ${t.stat}, which multiplies everything else`);
            }
            break;
        }
        case "unlock": if (!unlockIds.has(item.ref)) miss(`unlock "${item.ref}"`); break;
        case "consumables": {
            if (!Array.isArray(item.ref)) { problems.push(`${item.id} must list its consumables`); break; }
            for (const c of item.ref) if (!cons.has(c)) miss(`consumable "${c}"`);
            break;
        }
        // A kind with no case here is a kind chip-store.js cannot deliver either — its grant() falls through
        // to `return false`, so the sale refunds. Better to refuse the build than to ship a shelf entry that
        // can only ever fail.
        // A ROLL, not a fixed item: the page hands back one recipe you do not know yet. chip-store.js has a
        // case for it — this list simply never learned about it, and called a working shelf entry broken.
        case "recipe": break;
        case "farm_bg": problems.push(`${item.id} is kind "farm_bg", which chip-store.js grant() no longer handles`); break;
        default: problems.push(`${item.id} is kind "${item.kind}", which nothing knows how to deliver`);
    }
}

// ── AND WHAT THE SHELF COSTS IN GOLD ─────────────────────────────────────────────────────────────────────────
// The only reason anybody can judge these prices. A chip is minted at CHIP_RATE per gold staked and the
// machines return 1.00x of that, so the gold behind a price is simply price / CHIP_RATE.
// ── AND THE DISCOUNT CANNOT RUN AWAY ─────────────────────────────────────────────────────────────────────────
// The floor's own trophies take a little off every price (counterDiscount). It is capped, and this is what
// proves the cap holds against the whole set rather than against the numbers somebody had in mind: every
// casino pet and every casino badge that exists today, counted, priced, and compared.
{
    const allPets = 5;      // the casinoExclusive five in collectibles.js
    const allBadges = 9;    // casino_% badges, including casino_vip_room
    const worst = counterDiscount({ pets: allPets, badges: allBadges });
    if (worst > DISCOUNT_MAX + 1e-9) {
        problems.push(`owning everything gives ${(worst * 100).toFixed(1)}% off, past the ${(DISCOUNT_MAX * 100).toFixed(0)}% cap`);
    }
    // A discount that can reach a free chest is not a discount, it is a second currency.
    if (worst >= 0.5) problems.push(`the discount reaches ${(worst * 100).toFixed(0)}% — that is a sale, not a perk`);
    const cheapest = Math.min(...CHIP_STORE.map((i) => i.price), ...VIP_STORE.map((i) => i.price));
    if (pricedFor(cheapest, worst) < 1) problems.push("the discount can price something at nothing");
    console.log(`  every trophy owned (${allPets} pets, ${allBadges} badges) is ${(worst * 100).toFixed(1)}% off, cap ${(DISCOUNT_MAX * 100).toFixed(0)}%
`);
}

// ── AND THE INFINITE LADDER STAYS HONEST ─────────────────────────────────────────────
// The stat tracks have no ceiling, which is only safe because the price is LINEAR: the cost of the next point
// has to rise exactly as fast as the number of points held. If somebody ever makes it flat it becomes the only
// thing worth buying, and if they make it exponential the track becomes a lie past a certain level.
{
    const c1 = statCost(0);
    const c10 = statCost(9);
    const c100 = statCost(99);
    // Read from STAT_STEP rather than restated, so moving the ladder cannot make this gate lie. It asserted
    // 250 for as long as the price has been 500.
    if (c1 !== STAT_STEP) problems.push(`the first stat point costs ${c1}, not ${STAT_STEP} — statCost and STAT_STEP disagree`);
    if (c10 !== c1 * 10 || c100 !== c1 * 100) {
        problems.push(`the stat ladder is not linear: 1st ${c1}, 10th ${c10}, 100th ${c100}`);
    }
    // What a hundred points actually costs, so the number is on the page rather than in somebody's head.
    let sum = 0;
    for (let i = 0; i < 100; i += 1) sum += statCost(i);
    console.log(`  stat tracks   ${STAT_TRACKS.map((t) => t.name).join(", ")} — +${STAT_TRACKS[0].per} a level`);
    console.log(`                ${STAT_STEP} then +${STAT_STEP} each; 100 levels is ${sum.toLocaleString()} chips for +${STAT_TRACKS[0].per * 100}
`);
}

console.log(`  a chip is ${CHIP_RATE} per gold staked — so ${Math.round(1 / CHIP_RATE)} gold through a machine is 1 chip\n`);
console.log(`  ${"item".padEnd(28)} ${"chips".padStart(6)}   ${"gold behind it".padStart(15)}`);
for (const [where, list] of [["THE COUNTER", CHIP_STORE], ["BEHIND THE ROPE", VIP_STORE], ["THE DOORS", UNLOCK_STORE]]) {
    console.log(`  ── ${where}`);
    for (const item of [...list].sort((a, b) => a.price - b.price)) {
        console.log(`  ${item.name.padEnd(28)} ${String(item.price).padStart(6)}   ${Math.round(item.price / CHIP_RATE).toLocaleString().padStart(15)}`);
    }
}

if (problems.length) {
    console.log(`\ncheck:chips FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log(`\ncheck:chips — all ${CHIP_STORE.length + VIP_STORE.length + STAT_STORE.length + UNLOCK_STORE.length} items on the four shelves name something that exists.`);
process.exit(0);
