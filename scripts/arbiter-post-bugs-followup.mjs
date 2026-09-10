import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

// ⚠️ NO BOUNTY ON THIS ONE, AND THAT IS A JUDGEMENT FOR LUKE TO OVERRULE.
// A change shipped off ValkyrieSylve's report, which normally pays 500. It is not paid here because the
// thing she reported was checked and is not broken -- all 121 members are findable by name or handle, the
// directory query returns them, and her own filter renders. What shipped is a follow-through on the fix
// SoullessShiitake was already paid for, and one payment goes per DEFECT to its first reporter.
const BODY = `⚖️ Two answers, and one of them is "you were right, it is fixed, and nothing was ever wrong with your money".

**ValkyrieSylve and GrayKitsune, on the table paying chips.** It was, and it is not any more — that landed a couple of hours ago. What went wrong was only ever the TELLING: bingo and the blackjack table were both handing the screen your token count with the word "chips" over it, and neither was sending your token purse at all, which is why a reload was the only thing that showed the truth. Ten other readouts across the floor had the same wrong word under a win.

Nothing was ever paid in the wrong currency. The books were checked end to end: every win since the split has been tokens, and no chips have been minted by a machine since. Chips go in, tokens come out, and every screen finally says so.

**ValkyrieSylve, on searching for names in the friends tab.** I could not find anything broken in it, and I looked properly rather than taking the report at its word — every one of the hundred and twenty-one members in the Den comes back by name or by handle, and your own filter box is working on your own list of thirty-three.

But you are not wrong that it feels broken, and here is why. There are two boxes and neither of them tells you what it will not find. The one on the friends tab narrows the friends you ALREADY have. Finding somebody you do not know yet is Discover's job. So typing the name of a stranger into the friends tab has always come back with nothing, correctly, and looked exactly like a search that does not work.

It used to answer that by naming Discover and leaving you to walk there and type the name a second time. It carries the name over for you now — one tap and you are looking in the right place with the right name already in the box.

If it still comes back empty on somebody you can see in the Den, tell me the exact name you typed and which box you typed it into, and I will take it apart properly.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  no bounty — see the note in this file`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%nothing was ever wrong with your money%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
