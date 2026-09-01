// One Arbiter post to the BUGS channel. Guarded on a LIKE of the opening line. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

const BODY = `⚖️ Three you found tonight, all fixed, all paid.

${B}1787677309449-621442.webp
# David B — 500 gold
"Had found a 53 purse of gold in the mine left and it gave me 23 gold."

Both numbers were real, which is the worst kind. The chip in your haul was showing the purse as it came out of the ground, and the wallet was paying it at the rate everything in the Den is paid at — so a purse lost half of itself somewhere between finding it and banking it, and there was nothing on screen to say when or why. It is sized the moment you find it now. What the haul says is what you will be paid.

${B}1787623237423-972879.webp
# SoullessShiitake — 500 gold
"I am still at 39 games played since the update for Floor Regular. It also looks like High Roller and The Whale are both still tracking gold rather than chips."

Right on every count, and worse than it looked: those badges were not tracking slowly, they had stopped entirely the moment the floor started taking chips. Your 39 are the games you played before it. They count both again — nothing you did before the change was lost, and nothing since is missing. You are on 71.

${B}1786775465559-327040.webp
# ValkyrieSylve — 500 gold, and your 1,500 back
"Rerolling no longer gives fully fresh daily quests? Used to be able to complete all 3, then reroll to complete 3 more. Just wasted 1500 gold."

You did, and it could never have worked. The reroll was only replacing the cards you had NOT finished — so having finished all three, it had nothing to replace, took the gold, and changed nothing. There was no way for it to tell you that.

It hands over a full set again. What you finished today stays on the board and keeps its record — that was your own request last week and it still holds — and the new three come in underneath it. If there is genuinely nothing new left to draw, it now says so and costs you nothing.

The 1,500 is back in your purse, on top of the finder's fee.

Still open and not forgotten: the dungeon reward screen not matching what it pays, which is the same shape as the mine purse but a different room; the badge that counts farm ratings; the daily quest that will not accept a treat fed from your bag; the furnace pours; and the wave button. They are written down.`;

console.log(BODY); console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Three you found tonight%' AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
