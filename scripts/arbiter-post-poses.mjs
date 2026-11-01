import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

// ⚠️ A LAUNCH GOES TO #announce, NOT #bugs. The convention the Arbiter's own history shows: a bug round-up
// goes to the bug room with a companion where the reports came from; house news -- a launch, a rebuild, an
// economy change -- goes to announce. This is a launch, with a short pointer in global.
//
// ⚠️ AND IT SELLS SOMETHING, WHICH IS WHY IT WAITED FOR LUKE. Ten of the twenty cost store credit. Nothing
// about prices goes out on my own judgement.
//
// ⚠️ NO BOUNTY AND NO NUMBERS THAT ONLY MAKE SENSE IN CODE. See announcements-paraphrase-only.

const ANNOUNCE = `⚖️ **Twenty ways to stand, and your old heroes back.**

/images/poses/aloft.webp

Your hero has stood the same way since the day you made them — feet planted, weapon out, exactly like everybody else's. There is a new slot on the equipment screen for that, bottom-left of the paper doll beside the boots, and it decides how they stand.

**Ten of them are earned, and some of yours are already waiting.** Win a bout in the arena. Open twenty-five chests. Land fifty hits on a weekly boss. Take ten daily spins, catch fifty fish, cook fifty dishes, salvage a hundred pieces, put down a hundred wanderers in the Grove. The ones you have not reached show how far along you are rather than just saying no.

**Ten more are bought with store credit**, three dollars up to eight, and those are the loud ones — a standard raised overhead, an oath sworn on one knee, a landing out of the sky. A pose you buy is worn the moment you buy it.

**And your heroes are kept now.** Until today a new drawing replaced the one you had and the old one was gone, which is why some of you locked yours — that was the only way to say "I like this one". Locks are gone and nothing is lost: every hero you are drawn goes on a shelf under the paper doll, you can switch between them whenever you like for nothing, and the ones you star stay forever.

**Nothing redraws you behind your back any more.** Changing your gear or your pose no longer repaints your hero on its own — the shelf tells you when your hero is out of date, and there is an empty place on it that says "Draw a new hero". One a day. The one you were wearing is still there afterwards.`;

const GLOBAL = `⚖️ Your hero can stand differently now — a new Pose slot on the equipment screen, bottom-left of the paper doll. Ten earned, ten bought, and a few of yours are probably already unlocked.

Your old heroes are kept too. Locks are gone, nothing gets overwritten, and new drawings only happen when you ask. Full notice in the announcements room.`;

console.log(ANNOUNCE);
console.log("\n─────────────────────────────────────\n");
console.log(GLOBAL);
console.log(`\n[announce ${ANNOUNCE.length} chars · global ${GLOBAL.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Twenty ways to stand%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${ANNOUNCE}, 'announce')`;
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${GLOBAL}, 'global')`;
console.log("\nposted to announce and global.");
