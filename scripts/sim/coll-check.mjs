import { COLLECTION_PIECES, pieceById, piecesOfSet, sumPieceSea } from "../../src/lib/marketplace/collection-pieces.js";
import { ITEM_SETS, setOpeningReckoning, setSeaBonus } from "../../src/lib/marketplace/sets.js";
import { COLLECTIBLES } from "../../src/lib/marketplace/collectibles.js";

const set = ITEM_SETS.find(s => s.id === "commission");
const pieces = piecesOfSet("commission");
console.log(`set: ${set.name} — ${set.items.length} declared, ${pieces.length} defined`);
const missing = set.items.filter(id => !pieceById(id));
console.log(`  every declared id resolves: ${missing.length === 0 ? "yes" : "NO — " + missing}`);
console.log(`  every piece is in the set:  ${pieces.every(p => set.items.includes(p.id)) ? "yes" : "NO"}`);
console.log(`  ids unique across all sets: ${new Set(COLLECTION_PIECES.map(p=>p.id)).size === COLLECTION_PIECES.length ? "yes" : "NO"}`);
console.log(`  owning all 6 sea affinity:  ${JSON.stringify(sumPieceSea(set.items))}`);
console.log(`  capstone at 6:              ${setOpeningReckoning(set.items)}`);
console.log(`  capstone at 5:              ${setOpeningReckoning(set.items.slice(0,5))}`);
console.log(`  tier bonuses at 4:          ${JSON.stringify(setSeaBonus(set.items.slice(0,4)))}`);
// The five pets
const pets = COLLECTIBLES.filter(p => p.seaFightChance > 0);
console.log(`\npets: ${pets.length}`);
pets.forEach(p => console.log(`  ${p.id.padEnd(14)} ${p.rarity.padEnd(10)} ${JSON.stringify(p.sea)}  ownerOnly=${!!p.ownerOnly}`));
console.log(`  none leak into the chest pool: ${pets.every(p => p.source !== "chest") ? "yes" : "NO"}`);
