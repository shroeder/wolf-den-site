import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

const BODY = `⚖️ The rest of the list is cleared. Six more, all fixed, all paid.

${B}1787623237423-972879.webp
# SoullessShiitake — 1,000 gold
**The dungeon reward screen.** Right, and the two numbers were three lines apart on the same screen: the log under the card printed what the run had actually banked, and the card itself printed the roll before the Den's rate was taken off it. The card was the one lying.

**And the wave button waved at nobody.** It made your own hero wave for a second and a half and nothing left your browser — you waved, watched yourself wave, and the plaza saw somebody standing still. Every emoji beside it in that row does reach the room; the wave was the only one that did not. It does now. Waving at a *person* by tapping their name is still its own thing.

${B}1787231004681-977654.webp
# GrayKitsune — 1,000 gold
**The treat in your bag did not count.** Feeding a pet from the farm ticked the bounty; feeding the same treat from your inventory did not, so the card sent you to the farm to do the thing you had just done — and doing it again from the bag would not have worked either.

**And the furnace punished you for using its own bulk button.** Pouring everything you had of one ore counted as a single pour, so chasing five hundred meant undoing the feature that exists to save your thumb. It counts every batch now, exactly as the ore and the bounties always have.

${B}1788147059011-545268.webp
# Eric D — 500 gold
**Adored.** Both numbers you saw were real and neither was the one the badge promises. It was counting *people* — how many members have ever rated you — while your farm counts *ratings*, because somebody can come back and rate you again another day. Its own words say ratings, so ratings it is.

Which also means it was very nearly impossible. The most-loved farm in the Den has been rated by 29 different members out of a hundred and eleven, most of whom have never opened a farm at all, and nobody in the Den held the badge. Four of you have it now, and you are one of them.

${B}1786426256619-77678.webp
# Sunflower Jinxx — 500 gold
**"Your turn bar goes backwards instead of filling."** Nothing in the fight can move a bar backwards — but the drawing could. When something stops your bar, it was snapping back to where the bar had been at the start of the beat instead of stopping where it stood, so being frozen looked like being robbed of the progress you had made. It stops where it is now. That was wrong for every stun and freeze in the game, not only the one you were looking at.

Still open, and written down: the arena handing you a "best rewards" fight against somebody far below your weight — worth a fresh look now that the standings have been rebuilt, so tell me if it happens again tonight.`;

console.log(BODY); console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%rest of the list is cleared%' AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
