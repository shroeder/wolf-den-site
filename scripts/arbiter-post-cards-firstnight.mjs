// The Arbiter answers the first night's reports. Paraphrase only — nothing here quotes our conversation or
// names anything internal. Short paragraphs with air between them.
//   node scripts/arbiter-post-cards-firstnight.mjs [--apply]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ First night, five things found, all five fixed. This is exactly what the room is for.

**The fight that would not end.** You killed the last one and the board went empty and nothing happened — then the next card you played ended it. The win was being decided in three different places, and there are more than three ways to empty a board: a creature that dies on your Thorns during its own turn, and a bottle thrown at the whole room, both left the fight won and running. One place decides it now.

**Exhaust, Unplayable and Ethereal are words now.** Tap any gold word on a card and it will tell you what it does — on the merchant's shelf, at the fire, in an event, in your deck list. They were only ever pressable on two screens, which is why they read as paint everywhere else. Three of them had never been written down at all.

**Block going away at the start of your turn is on purpose.** Its note has always said so; you just could not reach the note. You can now.

**Sharpening Limit Break looked like it did nothing.** Both faces said the same sentence. It does the biggest thing an upgrade can do to that card — it stops being one-use — and the card was still promising to burn itself. It tells the truth now.

**And you can reach this room from inside the game.** Open the guide — the book — and there is a line at the bottom that brings you straight here. No second tab, and your run is saved every turn, so the trip costs you nothing.

Keep going. Still pays nothing, still on purpose.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}::uuid
   AND channel = 'testing' AND body LIKE '%First night, five things found%' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}::uuid, ${BODY}, 'testing')`;
console.log("posted.");
