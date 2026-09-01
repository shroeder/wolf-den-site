// One Arbiter post to the BUGS channel: the Gems cut record could go DOWN, and the purse was giving
// away the spin before the reels did. Guarded on a LIKE of the opening line. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const GRAY = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

const BODY = `⚖️ A record that punished you for playing.

# GrayKitsune — 500 gold
"Gems cut is only counting how many gems you currently own — if you merge them or socket them, the count goes down."

Exactly so, and it had it backwards in a way worth naming. Everything else on that wall is a tally of things you have DONE — pieces salvaged, parts combined, enhancements made. Gems cut was quietly counting what was in your bag. So fusing three gems into one took two off your trophy, and setting one into a socket took another.

Which means the member who never opened the Jewelcutter outranked the member who used it. A wall of records is supposed to be the one place nothing can be taken back.

It counts every gem that has ever reached you now, however it reached you, and nothing you do with them can lower it. Fuses and extractions are filtered out so a gem you reshaped is not counted a second time. Nobody's number went down; GrayKitsune's went from 15 to 24, and there are bigger jumps than that on the board.

# And the reels get to finish their sentence
Separately, and reported from the other side of the screen: your chip total was jumping to the final figure the moment you pressed the button — before a single reel had stopped, before the tenth ball was out of the hopper, before the card had finished daubing. The machine spent five seconds building to a result the number at the top had already handed you.

Two beats now. The stake leaves straight away, because that is the thing you just did. Whatever you won waits for the machine to say it first.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%record that punished you for playing%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
