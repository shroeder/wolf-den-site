// The one change that cannot go out silently: the casino now holds your winnings in a currency that did
// not exist yesterday. Paraphrase only, and it leads with "nothing was taken".
//   node scripts/arbiter-post-tokens.mjs [--apply]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ The casino floor has two currencies now, and I would rather you heard it from me than found it.

**Nothing has been taken.** Every chip you were holding has been handed to you a second time as tokens. If you were saving for something on the Counter, you are exactly as close to it tonight as you were this morning.

**Chips are what you feed the machines.** Gold buys them at the cage, and the free thousand a day is still free and still a thousand.

**Tokens are what you win, and the Counter only takes tokens.**

The reason is the machines. While one currency did both jobs, every point they paid out came off the price of everything on the shelf — so they had to be tight. They do not have to be any more. Every cabinet, the keno board and the bingo hall now pay out more than they take in. Sitting down with five thousand chips meaning to walk out with a pet used to end badly nine times in ten. It is closer to a coin flip.

The prices on the Counter have not moved, which quietly makes everything on it cheaper in gold than it was yesterday.

Go and lose some chips. It is harder than it was.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}::uuid
   AND channel = 'announce' AND body LIKE '%two currencies now%' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}::uuid, ${BODY}, 'announce')`;
console.log("posted to the News room.");
