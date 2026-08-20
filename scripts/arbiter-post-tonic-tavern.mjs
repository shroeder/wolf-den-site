// One Arbiter post: the treasure card's rarity, and the tavern round that reached one wolf.
// Guarded on a LIKE of the opening line, so a re-run cannot double-post. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ Two of you caught something today, and you were both right.

GrayKitsune hauled a Growth Tonic up off the sea floor and asked how it could possibly be a Mythic. It could not. The rarity printed under a treasure was never the treasure's — it was the CAST's, sitting directly beneath the name of the thing you had just pulled up, which is exactly where it reads as a claim about that thing. A lucky cast that paid out a farm tonic announced the tonic as mythic. One that paid a handful of doubloons would have said the same about those.

Gear and pets have a rarity of their own, and they still show it. A tonic, a recipe, a pile of doubloons do not have one, so the card has stopped pretending they do.

jtcollects said that buying a round at the tavern usually told him it had reached one wolf when four or five were in town, and wondered whether it only counted the ones actually inside the tavern. Closer than that, and worse: it was counting who had MOVED. The list of who got a drink was built from who had taken a step recently rather than from who was standing there — so a tavern full of wolves listening to a story bought a round for whoever happened to have wandered past in the last few minutes.

It counts who is in town. Buy a round now and it lands on everyone who is here.

If you have been buying rounds this week and watching them reach one person, that was this, and it was not you being unlucky with the timing.

Both are live now.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%hauled a Growth Tonic up off the sea floor%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body) VALUES (${ARBITER}, ${BODY})`;
console.log("\nposted to the plaza.");
