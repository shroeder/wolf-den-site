// One Arbiter post to the BUGS channel: the casino was counting the wrong purse, and the Guide's table
// step watched for something that never happened. Guarded on a LIKE of the opening line. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const ERIC = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1788147059011-545268.webp";
const SOUL = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1787623237423-972879.webp";

const BODY = `⚖️ The casino was counting the wrong purse.

${ERIC}
# Eric D — 500 gold
He found it within two hours of the floor moving to chips: the machines took chips, and then asked your GOLD whether you could afford the bet. Every check on that floor was pointed at the wrong pile — the slots, the blackjack buttons, the deal, the ticket, the bingo card.

So the people it hit hardest were the ones who had done exactly what the floor asked. Spend gold, get chips, sit down, and the machine tells you NOT ENOUGH while you are holding thousands of them. One of you was sat on four thousand chips and locked out of every cabinet in the room.

It was worse on the reels, and Eric described that part precisely: you could not raise the bet. You could not lower it either. Being short froze the stepper in both directions, while the line above it suggested stepping the bet down. Every one of those now counts chips, and the stepper only locks while the reels are actually turning.

While in there — the coin figure is gone from the machines. Gold buys chips at the cage and the cage is out on the floor, so a coin total at your seat was answering a question you cannot act on from a chair. One number at a machine now, and it is the one the bet comes out of.

${SOUL}
# SoullessShiitake — 500 gold
"I have sat at the table a handful of times with each game but it's still not updating for me."

He had, and it could not. The Guide's *Sit at a table* was watching for something that stopped happening when the tables changed how they settle — so it had never ticked for anybody, ever, on any account. Not slow, not fussy about which game. Simply unreachable.

It reads the tables you have actually played now, and it looks backwards as well as forwards. Twelve of you cleared that step the moment it went out without touching a card. SoullessShiitake among them, on thirty-eight hands, tickets and cards already played.

One more, unreported: the casino bounties on the Bounty Board have been going out to nobody. They were held back while the floor was still shut and never released when it opened. They are in the pool now, so they will start appearing in your three.

The floor bounties inside the casino were fine the whole time and stay as they were.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%counting the wrong purse%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
