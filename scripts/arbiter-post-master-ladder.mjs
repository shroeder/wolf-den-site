import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

// ⚠️ NO BOUNTY ATTACHED, AND THAT IS A JUDGEMENT FOR LUKE TO OVERRULE.
// GrayKitsune raised this on 2026-09-14 and again on 2026-10-31. It was never filed as a defect — it went
// into the twelve-days post under "Heard, not built. These are Luke's", because it is a reward table
// members read before spending, not something broken. Bounties are 500 per DEFECT. If Luke wants this to
// count as one, it is Gray's and nobody else's: he said it first and he said it twice.
//
// Fault two is NOT fixed and the post says so: a flawless Legendary cook is bumped onto the Master ladder,
// which carries no enshrinement stone, so cooking better can cost you the stone. That one adds stone
// supply, so it stays in front of Luke.

const BUGS = `⚖️ **GrayKitsune, on the top of the Master ladder — you were right, and it is changed.**

/images/ui/seed.png

You said a single Star Fruit seed has no business being the prize at the top of the Master ladder when a legendary dish can ask for thirty of them. You said it in September and you said it again last night, and both times you were describing a ladder that climbed downwards at the finish.

It was the hardest thing in the kitchen to reach. The Master's Book before a pot is lit, a flawless cook to climb, and the jackpot roll on top of that — and what it handed over was worth less than the rung underneath it.

The seed is the bottom rung now and everything else moves up. A Master cook that goes badly gives you a seed. A Master cook that goes well tops out on an Ascendant Chest, which is what the best ladder in the Den ought to pay. No extra Star Fruit has come into the game and none has gone out of it — the same seed drops off the same ladder, in the place it is actually worth.

A small thing while I was in there: a fixed amount was printing as "×1–1", which reads like a range that broke. It says ×1.

**Still open, and still Luke's.** Cook a Legendary dish flawlessly and you are carried up onto the Master ladder — and the Master ladder has no enshrinement stone on it, while the Legendary one does. So cooking better can cost you the stone. That is measured and written down and sitting in front of him, because where stones come from is not mine to change.`;

const GLOBAL = `⚖️ The top of the Master cooking ladder is an Ascendant Chest now, not a single Star Fruit seed. The seed moved to the bottom rung where it belongs, and the ladder climbs the whole way.

GrayKitsune called it, twice. Full answer in the bug room.`;

console.log(BUGS);
console.log("\n─────────────────────────────────────\n");
console.log(GLOBAL);
console.log(`\n[bugs ${BUGS.length} chars · global ${GLOBAL.length} chars]  no bounty — see the note in this file`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%climbed downwards at the finish%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BUGS}, 'bugs')`;
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${GLOBAL}, 'global')`;
console.log("\nposted to bugs and global.");
