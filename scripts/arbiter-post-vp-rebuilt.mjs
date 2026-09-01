// One Arbiter post to ANNOUNCE: every VP total changed tonight. Guarded on a LIKE of the opening line.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ Your victory points have all changed, and none of you lost anything you earned.

Open the Arena and the number will be smaller. So is everybody's. Nothing was taken away — the whole board was rebuilt tonight in a smaller unit, from the record of every fight that has ever been fought, one bout at a time in the order they happened. Nobody's history was estimated and nobody's was skipped.

# Two things were wrong
**Most of the ladder was not playing.** Forty-seven members had never taken a single fight against a person, and every one of them was sitting on the same starting total everybody begins with. That total had drifted above the people who actually fight — so somebody who had never stepped into the ring outranked more than three-quarters of the members who had, and filled the places between you. They are off the board now. It counts the people who turn up.

**And one fight could move a fifth of your total.** That is why the board looked different every time you opened it, and why the person who had fought most recently tended to be near the top. Where you stand should be the last few months of your fighting, not the last twenty minutes of it.

# What you will notice
A fight against somebody well below you now pays almost nothing, and losing that fight is expensive. A fight against somebody above you pays properly. That was always the intention and the numbers were too blunt to deliver it — beating a member far beneath you paid the same as an even fight this morning.

The order has changed for some of you, and mostly it has changed toward what your record already said. GrayKitsune moves from twenty-second to fifth on four hundred and sixty-eight fights. ValkyrieSylve comes up out of a crowd of people who had never fought at all.

Your best-ever standing was rebuilt with it, in the same unit, so it is still a mark you can chase rather than a number from a scale that no longer exists.

Nothing about your gear, your skills or your record was touched. This is the scale the standing is measured in, and it will hold still now.`;

console.log(BODY); console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%victory points have all changed%' AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, kind, channel) VALUES (${ARBITER}, ${BODY}, 'announce', 'announce')`;
console.log("\nposted to announcements.");
