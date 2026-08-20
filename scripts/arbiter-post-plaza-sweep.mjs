// One Arbiter post: everything the plaza reported over the last two days, and what it turned out to be.
// Guarded on a LIKE of the opening line, so a re-run cannot double-post. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ Six things you reported, and what each of them actually was.

NOBODY HAD TAKEN THE RAID. JT could not throw hands, GrayKitsune got "already taken" on everything, Sunflower Jinxx found every mob claimed, and Kaishiern asked the question that solved it — should the raid be up at all while the ring is shut. It should not have looked the way it did. Every possible failure in that screen printed the same sentence, so with combat closed for its rebuild, every tap on every foe reported that one of you had beaten the others to it. None of you had. You were all reading a message meant for a race that was not happening. Each reason says itself now, including that one.

A NIGHT'S SLEEP, BILLED TO A VOYAGE. GrayKitsune woke to a boat that had landed, fought the thing waiting for him, won, and was told to wait two more hours. When something intercepts your voyage the clock stops, and it starts again when you have dealt with it — so that you are never charged for the interruption. What it was also doing was charging you for the time between the interruption arriving and you waking up to it. A fight is minutes. The gap can be a whole night. It credits the fight now and nothing more. Five of you are sitting on an unanswered encounter as I write this; the oldest has been waiting eight days, and under the old rule answering it would have pushed that boat eight days further out to sea.

THE FRAGMENTS. Kaishiern noticed the delves still hand out chest fragments when nothing is built from fragments any more, and GrayKitsune worked out where they were going: they become doubloons. That was true, and the run was still calling them fragments while the card at the end called them coin — the same haul, described two ways, neither of them checkable against the other. The log says doubloons now, at the rate you actually get.

A SECOND HELPING IS NOT A SECOND PLATE. SoullessShiitake: paying out twice does not put two in your bag. Correct, and the fault was in what the kitchen said rather than in what it gave you. Seasoning doubles the SPOILS of a cook — the gold, the parts, the seeds — and never the dish itself. The reveal was stamping a "x2" on the dish's own name, which promised a plate that was never coming. It says the spoils now.

IS 0.8 BETTER THAN 1.2. GrayKitsune asked, then answered his own question by asking for the right number: damage times attack speed. Your gear screen prints it — how much damage a second you deal, with the working beside it. Which also settles the part underneath the question: attack speed is swings per second, so more is more.

AND THE CHARM THAT ONLY PAID WHEN YOU FAILED. Eric D: can the Prospector's Charm and the Lucky Lure do anything if you actually hit the chest? They could not. Both paid extra doubloons for a chest you did NOT finish, which made a six-hundred-gold charm worth nothing to anyone who digs well and something only to a bad afternoon. They bury a SECOND chest now — a real chance of two down there instead of one, said on the board while you still have dirt to move, so it is a reason to spend the last of your stamina rather than a surprise at the end.

One more, GrayKitsune, since you have asked twice about the Wolfpack: the sea matches you on what you have ARMED, not on how far you have sailed. It stopped measuring voyages a week ago. At one level of Cannons the Wolfpack is two tiers above anything that can be sent at you, and it cannot be drawn — you fought it before that changed. Your gunnery is excellent and your gun deck is nearly empty; barrels are what would move that, not luck.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%Six things you reported%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body) VALUES (${ARBITER}, ${BODY})`;
console.log("\nposted to the plaza.");
