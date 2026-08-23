// ── DOES THE COUNTER SELL THINGS THAT EXIST? ─────────────────────────────────────────────────────────────────
// Every item on the chip shelf names a ref in somebody else's catalog — a decoration id, a gem id, a
// consumable id, a forge part tier. Nothing checks those at runtime: the store takes the chips, writes the
// unlock row and reports success, and the member owns a decoration the farm has never heard of. It renders as
// nothing, it cannot be refunded by anyone who does not know it happened, and the only symptom is one person
// saying "I bought the thing and it isn't there".
//
// The first cut of that shelf invented EVERY id on it. This is the check that caught it.
import { CHIP_STORE, CHIP_RATE } from "../src/lib/marketplace/chips.js";
import { DECORATIONS } from "../src/lib/marketplace/decorations.js";
import { GEMS } from "../src/lib/marketplace/gems.js";
import { CONSUMABLES } from "../src/lib/marketplace/consumables.js";
import { COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";
import { PART_TIERS } from "../src/lib/marketplace/crafting.js";

const decos = new Set(DECORATIONS.map((d) => d.id));
const gems = new Set((GEMS || []).map((g) => g.id));
const cons = new Set(Object.keys(CONSUMABLES));
const pets = new Set(COLLECTIBLES.map((p) => p.id));
const tiers = new Set(PART_TIERS.map((t) => t.tier));

const problems = [];
const seen = new Set();

for (const item of CHIP_STORE) {
    if (seen.has(item.id)) problems.push(`two shelf entries share the id "${item.id}"`);
    seen.add(item.id);
    if (!(item.price > 0)) problems.push(`${item.id} is priced at ${item.price}`);

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
        case "consumables": {
            if (!Array.isArray(item.ref)) { problems.push(`${item.id} must list its consumables`); break; }
            for (const c of item.ref) if (!cons.has(c)) miss(`consumable "${c}"`);
            break;
        }
        // A kind with no case here is a kind chip-store.js cannot deliver either — its grant() falls through
        // to `return false`, so the sale refunds. Better to refuse the build than to ship a shelf entry that
        // can only ever fail.
        case "farm_bg": problems.push(`${item.id} is kind "farm_bg", which chip-store.js grant() no longer handles`); break;
        default: problems.push(`${item.id} is kind "${item.kind}", which nothing knows how to deliver`);
    }
}

// ── AND WHAT THE SHELF COSTS IN GOLD ─────────────────────────────────────────────────────────────────────────
// The only reason anybody can judge these prices. A chip is minted at CHIP_RATE per gold staked and the
// machines return 1.00x of that, so the gold behind a price is simply price / CHIP_RATE.
console.log(`  a chip is ${CHIP_RATE} per gold staked — so ${Math.round(1 / CHIP_RATE)} gold through a machine is 1 chip\n`);
console.log(`  ${"item".padEnd(28)} ${"chips".padStart(6)}   ${"gold behind it".padStart(15)}`);
for (const item of [...CHIP_STORE].sort((a, b) => a.price - b.price)) {
    console.log(`  ${item.name.padEnd(28)} ${String(item.price).padStart(6)}   ${Math.round(item.price / CHIP_RATE).toLocaleString().padStart(15)}`);
}

if (problems.length) {
    console.log(`\ncheck:chips FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
}
console.log(`\ncheck:chips — all ${CHIP_STORE.length} items on the counter name something that exists.`);
process.exit(0);
